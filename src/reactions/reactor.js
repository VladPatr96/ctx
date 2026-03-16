/**
 * reactor.js — Suggest-only reactions to GitHub events.
 *
 * Handles:
 * - ci_failed: generate fix → draft PR (max 2 attempts per CI run)
 * - changes_requested: generate draft reply comment
 *
 * Circuit breaker: 3 consecutive failures per event type → stop.
 * State persisted in .data/reactions-state.json via withLockSync.
 */

import { join } from 'node:path';
import { readJsonFile, writeJsonAtomic, withLockSync } from '../core/utils/state-io.js';
import { runCommand } from '../core/utils/shell.js';

// ==================== Config ====================

const CIRCUIT_THRESHOLD = 3;
const MAX_CI_ATTEMPTS = 2;

function getDataDir() {
  return process.env.CTX_DATA_DIR || join(process.cwd(), '.data');
}

function getStateFile() {
  return join(getDataDir(), 'reactions-state.json');
}

function getLockFile() {
  return join(getDataDir(), '.reactions.lock');
}

function defaultState() {
  return {
    circuitBreakers: {
      ci_failed: { consecutiveFailures: 0, circuitOpenAt: null, totalAttempts: 0, totalFailures: 0 },
      changes_requested: { consecutiveFailures: 0, circuitOpenAt: null, totalAttempts: 0, totalFailures: 0 },
    },
    reactions: {},
  };
}

// ==================== State helpers ====================

function loadState() {
  return readJsonFile(getStateFile(), defaultState());
}

function saveState(state) {
  writeJsonAtomic(getStateFile(), state);
}

function withState(fn) {
  return withLockSync(getLockFile(), () => {
    const state = loadState();
    const result = fn(state);
    saveState(state);
    return result;
  });
}

// ==================== Circuit Breaker ====================

export function isCircuitOpen(eventType) {
  const state = loadState();
  const cb = state.circuitBreakers[eventType];
  if (!cb) return false;
  return cb.consecutiveFailures >= CIRCUIT_THRESHOLD;
}

export function recordSuccess(eventType) {
  withState((state) => {
    if (!state.circuitBreakers[eventType]) {
      state.circuitBreakers[eventType] = { consecutiveFailures: 0, circuitOpenAt: null, totalAttempts: 0, totalFailures: 0 };
    }
    const cb = state.circuitBreakers[eventType];
    cb.consecutiveFailures = 0;
    cb.circuitOpenAt = null;
    cb.totalAttempts++;
  });
}

export function recordFailure(eventType) {
  withState((state) => {
    if (!state.circuitBreakers[eventType]) {
      state.circuitBreakers[eventType] = { consecutiveFailures: 0, circuitOpenAt: null, totalAttempts: 0, totalFailures: 0 };
    }
    const cb = state.circuitBreakers[eventType];
    cb.consecutiveFailures++;
    cb.totalAttempts++;
    cb.totalFailures++;
    if (cb.consecutiveFailures >= CIRCUIT_THRESHOLD && !cb.circuitOpenAt) {
      cb.circuitOpenAt = new Date().toISOString();
    }
  });
}

export function resetCircuitBreaker(eventType) {
  withState((state) => {
    if (state.circuitBreakers[eventType]) {
      state.circuitBreakers[eventType].consecutiveFailures = 0;
      state.circuitBreakers[eventType].circuitOpenAt = null;
    }
  });
}

// ==================== Event Handlers ====================

/**
 * Handle CI failure: collect logs → invoke AI → create draft PR.
 * Max 2 attempts per CI run.
 *
 * @param {object} opts
 * @param {string} opts.repo - owner/repo
 * @param {string|number} opts.runId - GitHub Actions run ID
 * @param {string} opts.headSha - commit SHA
 * @param {number} [opts.prNumber] - associated PR number
 * @param {function} [opts.invokeFn] - AI invocation (for tests)
 * @param {function} [opts.ghFn] - GitHub CLI wrapper (for tests)
 */
export async function handleCiFailed({ repo, runId, headSha, prNumber, invokeFn, ghFn }) {
  if (!repo || !runId) throw new Error('repo and runId are required');

  const eventType = 'ci_failed';
  const eventKey = `ci_failed:${repo}:${runId}`;
  const gh = ghFn || defaultGh;

  // Check circuit breaker
  if (isCircuitOpen(eventType)) {
    return { status: 'skipped', reason: 'circuit_open', eventKey };
  }

  // Check attempts
  const existing = withState((state) => state.reactions[eventKey] || null);
  if (existing && existing.attempts >= MAX_CI_ATTEMPTS) {
    return { status: 'skipped', reason: 'attempts_exhausted', eventKey, attempts: existing.attempts };
  }

  // Record attempt start
  const attemptNum = withState((state) => {
    if (!state.reactions[eventKey]) {
      state.reactions[eventKey] = {
        eventType, attempts: 0, lastAttempt: null, status: 'pending', result: null,
      };
    }
    state.reactions[eventKey].attempts++;
    state.reactions[eventKey].lastAttempt = new Date().toISOString();
    state.reactions[eventKey].status = 'processing';
    return state.reactions[eventKey].attempts;
  });

  try {
    // Collect context: failed logs
    const failedLogs = await gh('run', ['view', String(runId), '--log-failed', '-R', repo]);

    const prompt = [
      `CI run ${runId} failed for repo ${repo} (SHA: ${headSha}).`,
      prNumber ? `Associated PR: #${prNumber}` : '',
      'Failed CI logs (truncated):',
      failedLogs.slice(0, 8000),
      '',
      'Analyze the failure and provide a fix. Output ONLY a unified diff that can be applied with `git apply`.',
      'If you cannot determine a fix, respond with "NO_FIX" on the first line.',
    ].filter(Boolean).join('\n');

    const invoke = invokeFn || (await loadInvoke());
    const aiResult = await invoke('claude', prompt, { timeout: 120_000 });

    if (!aiResult || aiResult.status !== 'success' || !aiResult.response) {
      throw new Error(aiResult?.error || 'AI invocation failed');
    }

    const response = aiResult.response.trim();

    if (response.startsWith('NO_FIX')) {
      withState((state) => {
        state.reactions[eventKey].status = 'no_fix';
        state.reactions[eventKey].result = 'AI could not determine a fix';
      });
      recordFailure(eventType);
      return { status: 'no_fix', eventKey, attempt: attemptNum };
    }

    // Create branch + draft PR
    const branchName = `fix/ci-${runId}-attempt-${attemptNum}`;
    await gh('api', ['--method', 'POST',
      `-H`, 'Accept: application/vnd.github+json',
      `/repos/${repo}/git/refs`,
      '-f', `ref=refs/heads/${branchName}`,
      '-f', `sha=${headSha}`,
    ]);

    // Apply diff via gh api (create/update file)
    // For suggest-only, store the diff and create a draft PR with it in body
    const prTitle = `fix: CI run ${runId} auto-fix (attempt ${attemptNum})`;
    const prBody = [
      `## Auto-generated fix for CI failure`,
      ``,
      `**Run:** ${runId}`,
      `**SHA:** ${headSha}`,
      `**Attempt:** ${attemptNum}/${MAX_CI_ATTEMPTS}`,
      ``,
      '```diff',
      response.slice(0, 4000),
      '```',
      '',
      '> Suggest-only: review before merging.',
    ].join('\n');

    const prResult = await gh('pr', [
      'create', '--draft',
      '--title', prTitle,
      '--body', prBody,
      '--head', branchName,
      '-R', repo,
    ]);

    withState((state) => {
      state.reactions[eventKey].status = 'draft_pr_created';
      state.reactions[eventKey].result = { branch: branchName, pr: prResult.trim() };
    });
    recordSuccess(eventType);

    return { status: 'draft_pr_created', eventKey, attempt: attemptNum, branch: branchName, pr: prResult.trim() };

  } catch (err) {
    withState((state) => {
      state.reactions[eventKey].status = 'failed';
      state.reactions[eventKey].result = err.message;
    });
    recordFailure(eventType);
    return { status: 'failed', eventKey, attempt: attemptNum, error: err.message };
  }
}

/**
 * Handle changes_requested review: collect comments → invoke AI → return draft reply.
 *
 * @param {object} opts
 * @param {string} opts.repo - owner/repo
 * @param {number} opts.prNumber - PR number
 * @param {string} [opts.reviewer] - reviewer login
 * @param {string} [opts.comments] - pre-fetched comments text
 * @param {function} [opts.invokeFn] - AI invocation (for tests)
 * @param {function} [opts.ghFn] - GitHub CLI wrapper (for tests)
 */
export async function handleChangesRequested({ repo, prNumber, reviewer, comments, invokeFn, ghFn }) {
  if (!repo || !prNumber) throw new Error('repo and prNumber are required');

  const eventType = 'changes_requested';
  const eventKey = `changes_requested:${repo}:${prNumber}`;
  const gh = ghFn || defaultGh;

  // Check circuit breaker
  if (isCircuitOpen(eventType)) {
    return { status: 'skipped', reason: 'circuit_open', eventKey };
  }

  // Record attempt
  const attemptNum = withState((state) => {
    if (!state.reactions[eventKey]) {
      state.reactions[eventKey] = {
        eventType, attempts: 0, lastAttempt: null, status: 'pending', result: null,
      };
    }
    state.reactions[eventKey].attempts++;
    state.reactions[eventKey].lastAttempt = new Date().toISOString();
    state.reactions[eventKey].status = 'processing';
    return state.reactions[eventKey].attempts;
  });

  try {
    // Collect context
    let reviewContext = comments;
    if (!reviewContext) {
      reviewContext = await gh('pr', [
        'view', String(prNumber),
        '--json', 'reviews,comments,body,title',
        '-R', repo,
      ]);
    }

    const prompt = [
      `PR #${prNumber} in ${repo} received "changes requested"${reviewer ? ` from ${reviewer}` : ''}.`,
      '',
      'Review context:',
      String(reviewContext).slice(0, 8000),
      '',
      'Generate a draft reply addressing each review comment. Be constructive and concise.',
      'Format as a single comment body in Markdown.',
    ].join('\n');

    const invoke = invokeFn || (await loadInvoke());
    const aiResult = await invoke('claude', prompt, { timeout: 120_000 });

    if (!aiResult || aiResult.status !== 'success' || !aiResult.response) {
      throw new Error(aiResult?.error || 'AI invocation failed');
    }

    const draftReply = aiResult.response.trim();

    withState((state) => {
      state.reactions[eventKey].status = 'draft_ready';
      state.reactions[eventKey].result = { draftReply };
    });
    recordSuccess(eventType);

    return { status: 'draft_ready', eventKey, attempt: attemptNum, draftReply };

  } catch (err) {
    withState((state) => {
      state.reactions[eventKey].status = 'failed';
      state.reactions[eventKey].result = err.message;
    });
    recordFailure(eventType);
    return { status: 'failed', eventKey, attempt: attemptNum, error: err.message };
  }
}

// ==================== Poll Events ====================

/**
 * Poll GitHub for new events (CI failures, changes_requested).
 *
 * @param {object} opts
 * @param {string} opts.repo - owner/repo
 * @param {string} [opts.since] - ISO date filter
 * @param {string[]} [opts.types] - event types to poll (default: all)
 * @param {function} [opts.ghFn] - GitHub CLI wrapper (for tests)
 */
export async function pollEvents({ repo, since, types, ghFn }) {
  if (!repo) throw new Error('repo is required');

  const gh = ghFn || defaultGh;
  const eventTypes = types || ['ci_failed', 'changes_requested'];
  const events = [];
  const state = loadState();

  if (eventTypes.includes('ci_failed')) {
    try {
      const runsJson = await gh('run', [
        'list', '--json', 'databaseId,headSha,conclusion,createdAt,event',
        '--limit', '20',
        '-R', repo,
      ]);
      const runs = JSON.parse(runsJson);
      for (const run of runs) {
        if (run.conclusion !== 'failure') continue;
        if (since && run.createdAt < since) continue;
        const eventKey = `ci_failed:${repo}:${run.databaseId}`;
        if (state.reactions[eventKey]) continue; // dedup
        events.push({
          eventType: 'ci_failed',
          eventKey,
          payload: { repo, runId: run.databaseId, headSha: run.headSha },
        });
      }
    } catch {
      // gh run list may fail — non-fatal
    }
  }

  if (eventTypes.includes('changes_requested')) {
    try {
      const prsJson = await gh('pr', [
        'list', '--json', 'number,reviews,headRefOid',
        '--limit', '20',
        '-R', repo,
      ]);
      const prs = JSON.parse(prsJson);
      for (const pr of prs) {
        if (!pr.reviews) continue;
        const changesReq = pr.reviews.find(r => r.state === 'CHANGES_REQUESTED');
        if (!changesReq) continue;
        const eventKey = `changes_requested:${repo}:${pr.number}`;
        if (state.reactions[eventKey]) continue; // dedup
        events.push({
          eventType: 'changes_requested',
          eventKey,
          payload: { repo, prNumber: pr.number, reviewer: changesReq.author?.login },
        });
      }
    } catch {
      // gh pr list may fail — non-fatal
    }
  }

  return events;
}

// ==================== Status ====================

export function getReactorStatus() {
  const state = loadState();
  return {
    circuitBreakers: state.circuitBreakers,
    recentReactions: Object.entries(state.reactions)
      .sort(([, a], [, b]) => (b.lastAttempt || '').localeCompare(a.lastAttempt || ''))
      .slice(0, 20)
      .map(([key, val]) => ({ eventKey: key, ...val })),
    totalReactions: Object.keys(state.reactions).length,
  };
}

// ==================== Internal helpers ====================

async function defaultGh(subcommand, args = []) {
  const result = await runCommand('gh', [subcommand, ...args]);
  return result;
}

async function loadInvoke() {
  const mod = await import('../providers/index.js');
  return mod.invoke;
}
