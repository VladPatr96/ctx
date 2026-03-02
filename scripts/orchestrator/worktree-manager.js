/**
 * Worktree Manager — git worktree lifecycle for parallel AI agents.
 *
 * Each agent works in an isolated worktree with its own branch.
 * State is persisted in .data/worktrees.json with file-level locking.
 */

import { existsSync, mkdirSync, rmSync, realpathSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { runCommand } from '../utils/shell.js';
import { readJsonFile, writeJsonAtomic, withLockSync } from '../utils/state-io.js';

// ==================== Constants (lazy for testability) ====================

const AGENT_NAME_RE = /^[a-z0-9](?:[a-z0-9-]{0,62})$/;

export function getPluginRoot() {
  return process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
}

export function getWorktreesDir() {
  return join(getPluginRoot(), '.worktrees');
}

function getDataDir() {
  return process.env.CTX_DATA_DIR || join(getPluginRoot(), '.data');
}

function getStateFile() {
  return join(getDataDir(), 'worktrees.json');
}

function getLockFile() {
  return join(getDataDir(), '.worktrees.lock');
}

// ==================== Validation ====================

export function validateAgentId(agentId) {
  if (typeof agentId !== 'string' || !AGENT_NAME_RE.test(agentId)) {
    throw new Error('Invalid agent ID. Use kebab-case: lowercase letters, digits, hyphen (1-63 chars).');
  }
}

function safeWorktreePath(agentId) {
  validateAgentId(agentId);
  const base = resolve(getWorktreesDir());
  const target = resolve(base, agentId);
  if (!target.startsWith(`${base}${sep}`) && target !== base) {
    throw new Error('Invalid worktree path');
  }
  return target;
}

// ==================== State helpers ====================

function defaultState() {
  return { worktrees: {}, maxConcurrent: 3 };
}

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

// ==================== Porcelain parser ====================

function normalizePath(p) {
  // Resolve Windows 8.3 short names (e.g. 4F15~1 → Патраваев) via native realpath
  let resolved = p;
  try {
    if (existsSync(p)) resolved = realpathSync.native(p);
  } catch { /* best-effort */ }
  return resolved.replace(/\\/g, '/').toLowerCase();
}

function parsePorcelainOutput(stdout) {
  const entries = [];
  let current = null;
  for (const line of stdout.split('\n')) {
    if (line.startsWith('worktree ')) {
      if (current) entries.push(current);
      current = { path: line.slice('worktree '.length).trim() };
    } else if (line.startsWith('HEAD ') && current) {
      current.head = line.slice('HEAD '.length).trim();
    } else if (line.startsWith('branch ') && current) {
      current.branch = line.slice('branch '.length).trim().replace('refs/heads/', '');
    } else if (line === 'bare' && current) {
      current.bare = true;
    } else if (line === 'detached' && current) {
      current.detached = true;
    } else if (line === '' && current) {
      entries.push(current);
      current = null;
    }
  }
  if (current) entries.push(current);
  return entries;
}

// ==================== Core functions ====================

/**
 * Create a new worktree for an agent.
 */
export async function createWorktree(agentId, opts = {}) {
  validateAgentId(agentId);
  const wtPath = safeWorktreePath(agentId);
  const baseBranch = opts.baseBranch || 'master';
  const branchName = `agent/${agentId}`;

  // State check: duplicate + concurrent limit
  const info = withState((state) => {
    if (state.worktrees[agentId] && state.worktrees[agentId].status === 'active') {
      throw new Error(`Worktree for agent '${agentId}' already exists`);
    }
    const activeCount = Object.values(state.worktrees)
      .filter(w => w.status === 'active').length;
    if (activeCount >= (state.maxConcurrent || 3)) {
      throw new Error(`Concurrent worktree limit reached (${state.maxConcurrent || 3})`);
    }
    return { baseBranch, branchName };
  });

  // Ensure worktrees directory exists
  const wtDir = getWorktreesDir();
  if (!existsSync(wtDir)) mkdirSync(wtDir, { recursive: true });

  // Create worktree with new branch
  const result = await runCommand('git', [
    'worktree', 'add', '-b', info.branchName, wtPath, info.baseBranch
  ], { cwd: getPluginRoot(), timeout: 30000 });

  if (!result.success) {
    throw new Error(`Failed to create worktree: ${result.error}`);
  }

  // Update state
  const now = new Date().toISOString();
  withState((state) => {
    state.worktrees[agentId] = {
      path: `.worktrees/${agentId}`,
      branch: info.branchName,
      baseBranch: info.baseBranch,
      provider: opts.provider || null,
      task: opts.task || null,
      status: 'active',
      createdAt: now,
      updatedAt: now
    };
  });

  return {
    status: 'created',
    worktreePath: wtPath,
    branchName: info.branchName
  };
}

/**
 * Remove an agent's worktree.
 */
export async function removeWorktree(agentId, opts = {}) {
  validateAgentId(agentId);
  const wtPath = safeWorktreePath(agentId);
  const force = opts.force || false;
  const deleteBranch = opts.deleteBranch !== false;

  // Get branch name before removal
  const state = loadState();
  const entry = state.worktrees[agentId];
  const branchName = entry ? entry.branch : `agent/${agentId}`;

  // Remove worktree (force if requested)
  const removeArgs = ['worktree', 'remove'];
  if (force) removeArgs.push('--force');
  removeArgs.push(wtPath);

  let result = await runCommand('git', removeArgs, { cwd: getPluginRoot(), timeout: 30000 });

  // If worktree dir doesn't exist in git's view, clean up manually
  if (!result.success) {
    if (existsSync(wtPath)) {
      try { rmSync(wtPath, { recursive: true, force: true }); } catch { /* ignore */ }
    }
    await runCommand('git', ['worktree', 'prune'], { cwd: getPluginRoot(), timeout: 15000 });
  }

  // Prune stale worktree entries
  await runCommand('git', ['worktree', 'prune'], { cwd: getPluginRoot(), timeout: 15000 });

  // Optionally delete the branch
  let branchDeleted = false;
  if (deleteBranch) {
    const delFlag = force ? '-D' : '-d';
    const branchResult = await runCommand('git', ['branch', delFlag, branchName], {
      cwd: getPluginRoot(), timeout: 15000
    });
    branchDeleted = branchResult.success;
  }

  // Update state
  withState((s) => {
    if (s.worktrees[agentId]) {
      s.worktrees[agentId].status = 'removed';
      s.worktrees[agentId].updatedAt = new Date().toISOString();
    }
  });

  return { removed: true, branchDeleted };
}

/**
 * List all worktrees with enriched state.
 */
export async function listWorktrees() {
  const result = await runCommand('git', ['worktree', 'list', '--porcelain'], {
    cwd: getPluginRoot(), timeout: 15000
  });

  const gitWorktrees = result.success ? parsePorcelainOutput(result.stdout) : [];
  const state = loadState();

  // Merge git data with state
  const worktrees = [];
  for (const [agentId, entry] of Object.entries(state.worktrees)) {
    const absPath = resolve(getPluginRoot(), entry.path);
    const gitEntry = gitWorktrees.find(
      g => normalizePath(g.path) === normalizePath(absPath)
    );

    worktrees.push({
      agentId,
      ...entry,
      exists: !!gitEntry,
      head: gitEntry ? gitEntry.head : null
    });
  }

  const active = worktrees.filter(w => w.status === 'active');
  return { total: worktrees.length, active: active.length, worktrees };
}

/**
 * Get detailed status for a single worktree.
 */
export async function getWorktree(agentId) {
  validateAgentId(agentId);
  const state = loadState();
  const entry = state.worktrees[agentId];
  if (!entry) throw new Error(`No worktree found for agent '${agentId}'`);

  const wtPath = resolve(getPluginRoot(), entry.path);

  // HEAD
  const headResult = await runCommand('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: wtPath, timeout: 10000
  });
  const head = headResult.success ? headResult.stdout : null;

  // Dirty check
  const statusResult = await runCommand('git', ['status', '--porcelain'], {
    cwd: wtPath, timeout: 10000
  });
  const dirty = statusResult.success ? statusResult.stdout.length > 0 : false;

  // Drift
  const drift = await getDrift(agentId);

  return {
    agentId,
    ...entry,
    head,
    dirty,
    ...drift
  };
}

/**
 * Count commits ahead/behind relative to baseBranch.
 */
export async function getDrift(agentId) {
  validateAgentId(agentId);
  const state = loadState();
  const entry = state.worktrees[agentId];
  if (!entry) throw new Error(`No worktree found for agent '${agentId}'`);

  const result = await runCommand('git', [
    'rev-list', '--left-right', '--count',
    `${entry.baseBranch}...${entry.branch}`
  ], { cwd: getPluginRoot(), timeout: 10000 });

  if (!result.success) {
    return { aheadBy: 0, behindBy: 0 };
  }

  const parts = result.stdout.split(/\s+/);
  return {
    behindBy: parseInt(parts[0], 10) || 0,
    aheadBy: parseInt(parts[1], 10) || 0
  };
}

/**
 * Rebase agent branch onto baseBranch (or custom target).
 */
export async function rebaseWorktree(agentId, onto) {
  validateAgentId(agentId);
  const state = loadState();
  const entry = state.worktrees[agentId];
  if (!entry || entry.status !== 'active') {
    throw new Error(`No active worktree for agent '${agentId}'`);
  }

  const wtPath = resolve(getPluginRoot(), entry.path);
  const target = onto || entry.baseBranch;

  // Auto-stash
  const stashResult = await runCommand('git', ['stash', '--include-untracked'], {
    cwd: wtPath, timeout: 15000
  });
  const stashed = stashResult.success && !stashResult.stdout.includes('No local changes');

  // Rebase
  const rebaseResult = await runCommand('git', ['rebase', target], {
    cwd: wtPath, timeout: 60000
  });

  if (!rebaseResult.success) {
    // Abort failed rebase
    await runCommand('git', ['rebase', '--abort'], { cwd: wtPath, timeout: 15000 });
    // Pop stash if we stashed
    if (stashed) {
      await runCommand('git', ['stash', 'pop'], { cwd: wtPath, timeout: 15000 });
    }
    throw new Error(`Rebase failed: ${rebaseResult.error}`);
  }

  // Pop stash
  if (stashed) {
    await runCommand('git', ['stash', 'pop'], { cwd: wtPath, timeout: 15000 });
  }

  // Update state
  withState((s) => {
    if (s.worktrees[agentId]) {
      s.worktrees[agentId].updatedAt = new Date().toISOString();
    }
  });

  return { rebased: true, onto: target, stashed };
}

/**
 * Merge agent branch into baseBranch (no-ff).
 */
export async function mergeWorktree(agentId, opts = {}) {
  validateAgentId(agentId);
  const state = loadState();
  const entry = state.worktrees[agentId];
  if (!entry || entry.status !== 'active') {
    throw new Error(`No active worktree for agent '${agentId}'`);
  }

  const pluginRoot = getPluginRoot();
  const wtPath = resolve(pluginRoot, entry.path);
  const baseBranch = entry.baseBranch;
  const branchName = entry.branch;

  // Check main repo is clean
  const mainStatus = await runCommand('git', ['status', '--porcelain'], {
    cwd: pluginRoot, timeout: 10000
  });
  if (mainStatus.success && mainStatus.stdout.length > 0) {
    throw new Error('Main repository has uncommitted changes. Commit or stash before merging.');
  }

  // Auto-commit in worktree if dirty
  const wtStatus = await runCommand('git', ['status', '--porcelain'], {
    cwd: wtPath, timeout: 10000
  });
  if (wtStatus.success && wtStatus.stdout.length > 0) {
    await runCommand('git', ['add', '-A'], { cwd: wtPath, timeout: 15000 });
    const commitMsg = opts.message || `agent(${agentId}): auto-commit before merge`;
    await runCommand('git', ['commit', '-m', commitMsg], { cwd: wtPath, timeout: 15000 });
  }

  // Rebase onto baseBranch first
  const rebaseResult = await runCommand('git', ['rebase', baseBranch], {
    cwd: wtPath, timeout: 60000
  });
  if (!rebaseResult.success) {
    await runCommand('git', ['rebase', '--abort'], { cwd: wtPath, timeout: 15000 });
    withState((s) => {
      if (s.worktrees[agentId]) {
        s.worktrees[agentId].status = 'conflict';
        s.worktrees[agentId].updatedAt = new Date().toISOString();
      }
    });
    return { success: false, conflicts: true, mergedCommits: 0 };
  }

  // Count commits to merge
  const countResult = await runCommand('git', [
    'rev-list', '--count', `${baseBranch}..${branchName}`
  ], { cwd: pluginRoot, timeout: 10000 });
  const mergedCommits = countResult.success ? parseInt(countResult.stdout, 10) || 0 : 0;

  // Merge --no-ff into baseBranch from main repo
  const mergeArgs = ['merge', '--no-ff'];
  if (opts.squash) mergeArgs.push('--squash');
  const mergeMsg = opts.message || `Merge agent/${agentId} into ${baseBranch}`;
  mergeArgs.push('-m', mergeMsg, branchName);

  const mergeResult = await runCommand('git', mergeArgs, {
    cwd: pluginRoot, timeout: 60000
  });

  if (!mergeResult.success) {
    // Abort on conflict
    await runCommand('git', ['merge', '--abort'], { cwd: pluginRoot, timeout: 15000 });
    withState((s) => {
      if (s.worktrees[agentId]) {
        s.worktrees[agentId].status = 'conflict';
        s.worktrees[agentId].updatedAt = new Date().toISOString();
      }
    });
    return { success: false, conflicts: true, mergedCommits: 0 };
  }

  // If squash, commit
  if (opts.squash) {
    await runCommand('git', ['commit', '-m', mergeMsg], {
      cwd: pluginRoot, timeout: 15000
    });
  }

  // Update state
  withState((s) => {
    if (s.worktrees[agentId]) {
      s.worktrees[agentId].status = 'merged';
      s.worktrees[agentId].updatedAt = new Date().toISOString();
    }
  });

  return { success: true, conflicts: false, mergedCommits };
}
