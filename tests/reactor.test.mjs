import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Save original env
const origData = process.env.CTX_DATA_DIR;

function createTempDir() {
  return mkdtempSync(join(tmpdir(), 'reactor-test-'));
}

function setupEnv(dir) {
  process.env.CTX_DATA_DIR = join(dir, '.data');
}

function restoreEnv() {
  if (origData === undefined) delete process.env.CTX_DATA_DIR;
  else process.env.CTX_DATA_DIR = origData;
}

async function loadReactor() {
  const id = Date.now() + Math.random();
  return import(`../src/reactions/reactor.js?v=${id}`);
}

// Mock AI invoke — success
function mockInvoke(response = 'mock fix') {
  return async () => ({ status: 'success', response });
}

// Mock AI invoke — failure
function mockInvokeError(msg = 'AI error') {
  return async () => ({ status: 'error', error: msg });
}

// Mock gh CLI
function mockGh(responses = {}) {
  return async (subcommand, args = []) => {
    const key = `${subcommand}:${args[0] || ''}`;
    if (responses[key] !== undefined) return responses[key];
    // Default: return empty JSON for known commands
    if (subcommand === 'run' && args[0] === 'view') return 'Error: test failed\nline 2';
    if (subcommand === 'run' && args[0] === 'list') return '[]';
    if (subcommand === 'pr' && args[0] === 'view') return '{"reviews":[],"comments":[],"body":"test","title":"test"}';
    if (subcommand === 'pr' && args[0] === 'list') return '[]';
    if (subcommand === 'pr' && args[0] === 'create') return 'https://github.com/test/repo/pull/99';
    if (subcommand === 'api') return '{}';
    return '';
  };
}

// ==================== Circuit Breaker tests ====================

test('circuit breaker — initially closed', async () => {
  const dir = createTempDir();
  try {
    setupEnv(dir);
    const { isCircuitOpen } = await loadReactor();
    assert.equal(isCircuitOpen('ci_failed'), false);
    assert.equal(isCircuitOpen('changes_requested'), false);
  } finally {
    restoreEnv();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('circuit breaker — 3 failures opens circuit', async () => {
  const dir = createTempDir();
  try {
    setupEnv(dir);
    const { isCircuitOpen, recordFailure } = await loadReactor();

    recordFailure('ci_failed');
    assert.equal(isCircuitOpen('ci_failed'), false);
    recordFailure('ci_failed');
    assert.equal(isCircuitOpen('ci_failed'), false);
    recordFailure('ci_failed');
    assert.equal(isCircuitOpen('ci_failed'), true);
  } finally {
    restoreEnv();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('circuit breaker — recordSuccess resets consecutive count', async () => {
  const dir = createTempDir();
  try {
    setupEnv(dir);
    const { isCircuitOpen, recordFailure, recordSuccess } = await loadReactor();

    recordFailure('ci_failed');
    recordFailure('ci_failed');
    recordSuccess('ci_failed');
    assert.equal(isCircuitOpen('ci_failed'), false);

    // After reset, need 3 more failures to open
    recordFailure('ci_failed');
    recordFailure('ci_failed');
    assert.equal(isCircuitOpen('ci_failed'), false);
    recordFailure('ci_failed');
    assert.equal(isCircuitOpen('ci_failed'), true);
  } finally {
    restoreEnv();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('circuit breaker — resetCircuitBreaker clears open state', async () => {
  const dir = createTempDir();
  try {
    setupEnv(dir);
    const { isCircuitOpen, recordFailure, resetCircuitBreaker } = await loadReactor();

    recordFailure('ci_failed');
    recordFailure('ci_failed');
    recordFailure('ci_failed');
    assert.equal(isCircuitOpen('ci_failed'), true);

    resetCircuitBreaker('ci_failed');
    assert.equal(isCircuitOpen('ci_failed'), false);
  } finally {
    restoreEnv();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('circuit breaker — types are independent', async () => {
  const dir = createTempDir();
  try {
    setupEnv(dir);
    const { isCircuitOpen, recordFailure } = await loadReactor();

    recordFailure('ci_failed');
    recordFailure('ci_failed');
    recordFailure('ci_failed');
    assert.equal(isCircuitOpen('ci_failed'), true);
    assert.equal(isCircuitOpen('changes_requested'), false);
  } finally {
    restoreEnv();
    rmSync(dir, { recursive: true, force: true });
  }
});

// ==================== handleCiFailed tests ====================

test('handleCiFailed — successful draft PR creation', async () => {
  const dir = createTempDir();
  try {
    setupEnv(dir);
    const { handleCiFailed } = await loadReactor();

    const result = await handleCiFailed({
      repo: 'owner/repo',
      runId: 12345,
      headSha: 'abc123',
      prNumber: 1,
      invokeFn: mockInvoke('--- a/file.js\n+++ b/file.js\n@@ -1 +1 @@\n-bad\n+good'),
      ghFn: mockGh(),
    });

    assert.equal(result.status, 'draft_pr_created');
    assert.equal(result.eventKey, 'ci_failed:owner/repo:12345');
    assert.equal(result.attempt, 1);
    assert.ok(result.branch);
    assert.ok(result.pr);
  } finally {
    restoreEnv();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('handleCiFailed — skipped when circuit open', async () => {
  const dir = createTempDir();
  try {
    setupEnv(dir);
    const { handleCiFailed, recordFailure } = await loadReactor();

    // Open the circuit
    recordFailure('ci_failed');
    recordFailure('ci_failed');
    recordFailure('ci_failed');

    const result = await handleCiFailed({
      repo: 'owner/repo',
      runId: 99,
      headSha: 'abc',
      invokeFn: mockInvoke(),
      ghFn: mockGh(),
    });

    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'circuit_open');
  } finally {
    restoreEnv();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('handleCiFailed — attempts exhausted after 2', async () => {
  const dir = createTempDir();
  try {
    setupEnv(dir);
    const { handleCiFailed } = await loadReactor();

    // First two attempts
    await handleCiFailed({
      repo: 'owner/repo', runId: 42, headSha: 'sha1',
      invokeFn: mockInvoke('--- fix'), ghFn: mockGh(),
    });
    await handleCiFailed({
      repo: 'owner/repo', runId: 42, headSha: 'sha1',
      invokeFn: mockInvoke('--- fix'), ghFn: mockGh(),
    });

    // Third attempt should be skipped
    const result = await handleCiFailed({
      repo: 'owner/repo', runId: 42, headSha: 'sha1',
      invokeFn: mockInvoke('--- fix'), ghFn: mockGh(),
    });

    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'attempts_exhausted');
    assert.equal(result.attempts, 2);
  } finally {
    restoreEnv();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('handleCiFailed — AI returning NO_FIX records failure', async () => {
  const dir = createTempDir();
  try {
    setupEnv(dir);
    const { handleCiFailed } = await loadReactor();

    const result = await handleCiFailed({
      repo: 'owner/repo', runId: 77, headSha: 'sha2',
      invokeFn: mockInvoke('NO_FIX: cannot determine'),
      ghFn: mockGh(),
    });

    assert.equal(result.status, 'no_fix');
  } finally {
    restoreEnv();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('handleCiFailed — missing params throws', async () => {
  const dir = createTempDir();
  try {
    setupEnv(dir);
    const { handleCiFailed } = await loadReactor();

    await assert.rejects(
      () => handleCiFailed({ repo: 'owner/repo' }),
      /runId/
    );
  } finally {
    restoreEnv();
    rmSync(dir, { recursive: true, force: true });
  }
});

// ==================== handleChangesRequested tests ====================

test('handleChangesRequested — successful draft reply', async () => {
  const dir = createTempDir();
  try {
    setupEnv(dir);
    const { handleChangesRequested } = await loadReactor();

    const result = await handleChangesRequested({
      repo: 'owner/repo',
      prNumber: 10,
      reviewer: 'alice',
      comments: 'Please fix the types',
      invokeFn: mockInvoke('Thank you for the review. I will fix the types.'),
      ghFn: mockGh(),
    });

    assert.equal(result.status, 'draft_ready');
    assert.equal(result.eventKey, 'changes_requested:owner/repo:10');
    assert.ok(result.draftReply.includes('fix the types'));
  } finally {
    restoreEnv();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('handleChangesRequested — skipped when circuit open', async () => {
  const dir = createTempDir();
  try {
    setupEnv(dir);
    const { handleChangesRequested, recordFailure } = await loadReactor();

    recordFailure('changes_requested');
    recordFailure('changes_requested');
    recordFailure('changes_requested');

    const result = await handleChangesRequested({
      repo: 'owner/repo', prNumber: 5,
      invokeFn: mockInvoke(), ghFn: mockGh(),
    });

    assert.equal(result.status, 'skipped');
    assert.equal(result.reason, 'circuit_open');
  } finally {
    restoreEnv();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('handleChangesRequested — AI failure records failure', async () => {
  const dir = createTempDir();
  try {
    setupEnv(dir);
    const { handleChangesRequested } = await loadReactor();

    const result = await handleChangesRequested({
      repo: 'owner/repo', prNumber: 15,
      comments: 'fix it',
      invokeFn: mockInvokeError('timeout'),
      ghFn: mockGh(),
    });

    assert.equal(result.status, 'failed');
    assert.ok(result.error);
  } finally {
    restoreEnv();
    rmSync(dir, { recursive: true, force: true });
  }
});

// ==================== pollEvents tests ====================

test('pollEvents — deduplicates by eventKey', async () => {
  const dir = createTempDir();
  try {
    setupEnv(dir);
    const { pollEvents, handleCiFailed } = await loadReactor();

    const gh = mockGh({
      'run:list': JSON.stringify([
        { databaseId: 100, headSha: 'sha100', conclusion: 'failure', createdAt: '2026-01-01T00:00:00Z', event: 'push' },
        { databaseId: 101, headSha: 'sha101', conclusion: 'failure', createdAt: '2026-01-01T00:00:00Z', event: 'push' },
      ]),
      'pr:list': '[]',
    });

    // First poll — both events appear
    const events1 = await pollEvents({ repo: 'owner/repo', ghFn: gh });
    assert.equal(events1.length, 2);

    // Handle one event to put it in state
    await handleCiFailed({
      repo: 'owner/repo', runId: 100, headSha: 'sha100',
      invokeFn: mockInvoke('fix'), ghFn: mockGh(),
    });

    // Second poll — only the unprocessed event
    const events2 = await pollEvents({ repo: 'owner/repo', ghFn: gh });
    assert.equal(events2.length, 1);
    assert.equal(events2[0].payload.runId, 101);
  } finally {
    restoreEnv();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pollEvents — filters by since date', async () => {
  const dir = createTempDir();
  try {
    setupEnv(dir);
    const { pollEvents } = await loadReactor();

    const gh = mockGh({
      'run:list': JSON.stringify([
        { databaseId: 200, headSha: 'sha200', conclusion: 'failure', createdAt: '2025-12-01T00:00:00Z', event: 'push' },
        { databaseId: 201, headSha: 'sha201', conclusion: 'failure', createdAt: '2026-02-01T00:00:00Z', event: 'push' },
      ]),
      'pr:list': '[]',
    });

    const events = await pollEvents({
      repo: 'owner/repo',
      since: '2026-01-01T00:00:00Z',
      ghFn: gh,
    });

    assert.equal(events.length, 1);
    assert.equal(events[0].payload.runId, 201);
  } finally {
    restoreEnv();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('pollEvents — missing repo throws', async () => {
  const dir = createTempDir();
  try {
    setupEnv(dir);
    const { pollEvents } = await loadReactor();

    await assert.rejects(
      () => pollEvents({}),
      /repo is required/
    );
  } finally {
    restoreEnv();
    rmSync(dir, { recursive: true, force: true });
  }
});

// ==================== getReactorStatus tests ====================

test('getReactorStatus — returns circuit breakers and reactions', async () => {
  const dir = createTempDir();
  try {
    setupEnv(dir);
    const { getReactorStatus, recordFailure } = await loadReactor();

    recordFailure('ci_failed');

    const status = getReactorStatus();
    assert.ok(status.circuitBreakers);
    assert.ok(status.circuitBreakers.ci_failed);
    assert.equal(status.circuitBreakers.ci_failed.consecutiveFailures, 1);
    assert.equal(status.circuitBreakers.ci_failed.totalFailures, 1);
    assert.equal(typeof status.totalReactions, 'number');
    assert.ok(Array.isArray(status.recentReactions));
  } finally {
    restoreEnv();
    rmSync(dir, { recursive: true, force: true });
  }
});
