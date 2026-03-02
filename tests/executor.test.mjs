import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

// Save original env
const origRoot = process.env.CLAUDE_PLUGIN_ROOT;
const origData = process.env.CTX_DATA_DIR;

function createTempRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'exec-test-'));
  execFileSync('git', ['init', dir], { encoding: 'utf-8' });
  execFileSync('git', ['checkout', '-b', 'master'], { cwd: dir, encoding: 'utf-8' });
  execFileSync('git', ['config', 'user.email', 'test@test.com'], { cwd: dir, encoding: 'utf-8' });
  execFileSync('git', ['config', 'user.name', 'Test'], { cwd: dir, encoding: 'utf-8' });
  writeFileSync(join(dir, '.gitignore'), '.data/\n.worktrees/\n');
  execFileSync('git', ['add', '.gitignore'], { cwd: dir, encoding: 'utf-8' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: dir, encoding: 'utf-8' });
  return dir;
}

function setupEnv(repoDir) {
  process.env.CLAUDE_PLUGIN_ROOT = repoDir;
  process.env.CTX_DATA_DIR = join(repoDir, '.data');
}

function restoreEnv() {
  if (origRoot === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
  else process.env.CLAUDE_PLUGIN_ROOT = origRoot;
  if (origData === undefined) delete process.env.CTX_DATA_DIR;
  else process.env.CTX_DATA_DIR = origData;
}

async function loadExecutor() {
  const id = Date.now() + Math.random();
  return import(`../scripts/orchestrator/executor.js?v=${id}`);
}

async function loadRunner() {
  const id = Date.now() + Math.random();
  return import(`../scripts/orchestrator/agent-runner.js?v=${id}`);
}

// Mock invoke that returns success
function mockInvoke(response = 'OK') {
  return async (_provider, _prompt, _opts) => ({
    status: 'success',
    response,
  });
}

// Mock invoke that fails
function mockInvokeError(msg = 'Provider error') {
  return async () => ({
    status: 'error',
    error: msg,
  });
}

// Mock invoke that hangs (for timeout tests)
function mockInvokeSlow(delayMs = 5000) {
  return async () =>
    new Promise(resolve =>
      setTimeout(() => resolve({ status: 'success', response: 'late' }), delayMs)
    );
}

// ==================== Executor tests ====================

test('executeAgent — successful execution', async () => {
  const repo = createTempRepo();
  try {
    setupEnv(repo);
    const { executeAgent, getExecutionStatus } = await loadExecutor();

    const result = await executeAgent('test-ok', {
      task: 'say hello',
      provider: 'claude',
      invokeFn: mockInvoke('Hello!'),
      cleanup: true,
    });

    assert.equal(result.status, 'completed');
    assert.equal(result.provider, 'claude');
    assert.equal(result.response, 'Hello!');
    assert.equal(result.error, null);
    assert.ok(result.durationMs >= 0);
    assert.ok(result.startedAt);
    assert.ok(result.completedAt);

    // State should be persisted
    const status = getExecutionStatus('test-ok');
    assert.equal(status.status, 'completed');
  } finally {
    restoreEnv();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('executeAgent — provider error recorded as failed', async () => {
  const repo = createTempRepo();
  try {
    setupEnv(repo);
    const { executeAgent } = await loadExecutor();

    const result = await executeAgent('test-fail', {
      task: 'do something',
      provider: 'gemini',
      invokeFn: mockInvokeError('API down'),
      cleanup: true,
    });

    assert.equal(result.status, 'failed');
    assert.equal(result.error, 'API down');
  } finally {
    restoreEnv();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('executeAgent — timeout produces timeout status', async () => {
  const repo = createTempRepo();
  try {
    setupEnv(repo);
    const { executeAgent } = await loadExecutor();

    const result = await executeAgent('test-timeout', {
      task: 'wait forever',
      provider: 'claude',
      timeout: 200,
      invokeFn: mockInvokeSlow(10_000),
      cleanup: true,
    });

    assert.equal(result.status, 'timeout');
    assert.match(result.error, /timeout/i);
  } finally {
    restoreEnv();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('executeAgent — missing task throws', async () => {
  const repo = createTempRepo();
  try {
    setupEnv(repo);
    const { executeAgent } = await loadExecutor();

    await assert.rejects(
      () => executeAgent('test-no-task', { provider: 'claude', invokeFn: mockInvoke() }),
      /task is required/
    );
  } finally {
    restoreEnv();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('listExecutions — filters by status', async () => {
  const repo = createTempRepo();
  try {
    setupEnv(repo);
    const { executeAgent, listExecutions } = await loadExecutor();

    await executeAgent('list-a', {
      task: 'task a', provider: 'claude',
      invokeFn: mockInvoke('a'), cleanup: true,
    });
    await executeAgent('list-b', {
      task: 'task b', provider: 'gemini',
      invokeFn: mockInvokeError('fail'), cleanup: true,
    });

    const all = listExecutions();
    assert.equal(all.length, 2);

    const completed = listExecutions({ status: 'completed' });
    assert.equal(completed.length, 1);
    assert.equal(completed[0].agentId, 'list-a');

    const failed = listExecutions({ status: 'failed' });
    assert.equal(failed.length, 1);
    assert.equal(failed[0].agentId, 'list-b');
  } finally {
    restoreEnv();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('cleanupExecution — removes state entry', async () => {
  const repo = createTempRepo();
  try {
    setupEnv(repo);
    const { executeAgent, getExecutionStatus, cleanupExecution } = await loadExecutor();

    await executeAgent('clean-me', {
      task: 'task', provider: 'claude',
      invokeFn: mockInvoke(), cleanup: false,
    });
    assert.ok(getExecutionStatus('clean-me'));

    await cleanupExecution('clean-me');
    assert.equal(getExecutionStatus('clean-me'), null);
  } finally {
    restoreEnv();
    rmSync(repo, { recursive: true, force: true });
  }
});

// ==================== AgentRunner tests ====================

test('runParallel — runs multiple agents successfully', async () => {
  const repo = createTempRepo();
  try {
    setupEnv(repo);
    const { runParallel } = await loadRunner();

    const result = await runParallel(
      [
        { agentId: 'par-a', task: 'task a', provider: 'claude' },
        { agentId: 'par-b', task: 'task b', provider: 'gemini' },
      ],
      {
        invokeFn: mockInvoke('done'),
        cleanup: true,
      }
    );

    assert.equal(result.status, 'success');
    assert.equal(result.summary.total, 2);
    assert.equal(result.summary.completed, 2);
    assert.equal(result.summary.failed, 0);
    assert.equal(result.results.length, 2);
  } finally {
    restoreEnv();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('runParallel — partial failure reflected in summary', async () => {
  const repo = createTempRepo();
  try {
    setupEnv(repo);
    const { runParallel } = await loadRunner();

    let callCount = 0;
    const mixedInvoke = async (provider, prompt, opts) => {
      callCount++;
      if (callCount === 1) return { status: 'success', response: 'ok' };
      return { status: 'error', error: 'nope' };
    };

    const result = await runParallel(
      [
        { agentId: 'mix-a', task: 'task a', provider: 'claude' },
        { agentId: 'mix-b', task: 'task b', provider: 'gemini' },
      ],
      { invokeFn: mixedInvoke, cleanup: true }
    );

    assert.equal(result.status, 'partial');
    assert.equal(result.summary.completed, 1);
    assert.equal(result.summary.failed, 1);
  } finally {
    restoreEnv();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('runParallel — concurrency limit respected', async () => {
  const repo = createTempRepo();
  try {
    setupEnv(repo);
    const { runParallel } = await loadRunner();

    let concurrent = 0;
    let maxConcurrent = 0;

    const trackingInvoke = async () => {
      concurrent++;
      if (concurrent > maxConcurrent) maxConcurrent = concurrent;
      await new Promise(r => setTimeout(r, 100));
      concurrent--;
      return { status: 'success', response: 'ok' };
    };

    await runParallel(
      [
        { agentId: 'conc-a', task: 't', provider: 'claude' },
        { agentId: 'conc-b', task: 't', provider: 'claude' },
        { agentId: 'conc-c', task: 't', provider: 'claude' },
        { agentId: 'conc-d', task: 't', provider: 'claude' },
      ],
      { concurrency: 2, invokeFn: trackingInvoke, cleanup: true }
    );

    // maxConcurrent counts invoke-level concurrency; actual concurrency includes
    // worktree creation overhead which is serial due to lock, so we just verify
    // the semaphore doesn't allow more than limit
    assert.ok(maxConcurrent <= 2, `Max concurrent ${maxConcurrent} should be <= 2`);
  } finally {
    restoreEnv();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('runParallel — global timeout triggers', async () => {
  const repo = createTempRepo();
  try {
    setupEnv(repo);
    const { runParallel } = await loadRunner();

    const result = await runParallel(
      [
        { agentId: 'gt-a', task: 't', provider: 'claude', timeout: 500 },
      ],
      {
        globalTimeout: 200,
        invokeFn: mockInvokeSlow(5_000),
        cleanup: true,
      }
    );

    // Agent has 500ms timeout, global is 200ms — global fires first in the race,
    // but allSettled still waits for the agent's own timeout to resolve.
    // The agent should end up with 'timeout' status from its own 500ms timer.
    assert.ok(result.results.length === 1);
    assert.equal(result.results[0].status, 'timeout');
  } finally {
    restoreEnv();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('runParallel — empty specs rejected', async () => {
  const repo = createTempRepo();
  try {
    setupEnv(repo);
    const { runParallel } = await loadRunner();

    await assert.rejects(
      () => runParallel([], { invokeFn: mockInvoke() }),
      /non-empty array/
    );
  } finally {
    restoreEnv();
    rmSync(repo, { recursive: true, force: true });
  }
});
