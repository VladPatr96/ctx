import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createTempGitRepo, getCurrentBranch } from './helpers/git-test-repo.mjs';

const origRoot = process.env.CLAUDE_PLUGIN_ROOT;
const origData = process.env.CTX_DATA_DIR;

function setupEnv(root) {
  process.env.CLAUDE_PLUGIN_ROOT = root;
  process.env.CTX_DATA_DIR = join(root, '.data');
}

function restoreEnv() {
  if (origRoot === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
  else process.env.CLAUDE_PLUGIN_ROOT = origRoot;
  if (origData === undefined) delete process.env.CTX_DATA_DIR;
  else process.env.CTX_DATA_DIR = origData;
}

async function loadPipelineModule() {
  const id = Date.now() + Math.random();
  return import(`../src/orchestrator/development-pipeline.js?v=${id}`);
}

test('development pipeline uses step machine as source of truth for successful run', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ctx-dev-pipeline-'));
  try {
    setupEnv(root);
    const { createDevelopmentPipeline } = await loadPipelineModule();

    const pipeline = createDevelopmentPipeline({
      runParallelFn: async () => ({
        status: 'success',
        durationMs: 25,
        summary: { total: 2, completed: 2, failed: 0 },
        results: [
          { agentId: 'agent-a', status: 'completed', durationMs: 10 },
          { agentId: 'agent-b', status: 'completed', durationMs: 11 },
        ],
      }),
      mergeWorktreeFn: async () => ({ success: true, conflicts: false, mergedCommits: 1 }),
      removeWorktreeFn: async () => {},
      runTestsFn: async () => ({ success: true, skipped: false, output: 'ok', exitCode: 0, durationMs: 5 }),
      resolveConflictsFn: async () => ({ success: true }),
      gitFn: async () => ({ success: true, stdout: '', stderr: '' }),
      getChangedFilesFn: async (agentId) => [agentId + '.js'],
    });

    const result = await pipeline.run([
      { agentId: 'agent-a', task: 'a', provider: 'claude' },
      { agentId: 'agent-b', task: 'b', provider: 'gemini' },
    ]);

    assert.equal(result.status, 'success');
    assert.equal(result.task.status, 'completed');
    assert.equal(result.artifactBundle.status, 'completed');
    assert.ok(result.artifactBundle.artifacts.some((artifact) => artifact.label === 'pipeline-report'));
    assert.ok(result.artifactBundle.artifacts.some((artifact) => artifact.label === 'integration-branch'));
    assert.equal(result.steps.execute_agents.status, 'completed');
    assert.equal(result.steps.sort_merges.status, 'completed');
    assert.equal(result.steps['merge:agent-a'].status, 'completed');
    assert.equal(result.steps['merge:agent-b'].status, 'completed');
    assert.equal(result.steps.verify_integration.status, 'completed');
    assert.equal(result.steps.finalize_integration.status, 'completed');

    const persisted = JSON.parse(
      readFileSync(join(root, '.data', 'pipelines', `${result.pipelineId}.json`), 'utf-8')
    );
    assert.equal(persisted.artifactBundle, undefined);

    const status = pipeline.getStatus(result.pipelineId);
    assert.equal(status.artifactBundle.status, 'completed');
  } finally {
    restoreEnv();
    rmSync(root, { recursive: true, force: true });
  }
});

test('development pipeline records retryable merge failure after suspended conflict resolution', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ctx-dev-pipeline-'));
  try {
    setupEnv(root);
    const { createDevelopmentPipeline } = await loadPipelineModule();

    const pipeline = createDevelopmentPipeline({
      runParallelFn: async () => ({
        status: 'success',
        durationMs: 20,
        summary: { total: 1, completed: 1, failed: 0 },
        results: [{ agentId: 'agent-a', status: 'completed', durationMs: 10 }],
      }),
      mergeWorktreeFn: async () => ({ success: false, conflicts: true, mergedCommits: 0 }),
      removeWorktreeFn: async () => {},
      runTestsFn: async () => ({ success: true, skipped: true, output: '', exitCode: null, durationMs: 0 }),
      resolveConflictsFn: async () => ({ success: false, error: 'still conflicted' }),
      gitFn: async () => ({ success: true, stdout: '', stderr: '' }),
      getChangedFilesFn: async () => ['agent-a.js'],
    });

    const result = await pipeline.run([
      { agentId: 'agent-a', task: 'a', provider: 'claude' },
    ]);

    assert.equal(result.steps['merge:agent-a'].status, 'failed');
    assert.equal(result.steps['merge:agent-a'].failureKind, 'retryable');
    assert.ok(result.steps['merge:agent-a'].transitions.some(t => t.event === 'suspend'));
  } finally {
    restoreEnv();
    rmSync(root, { recursive: true, force: true });
  }
});

test('development pipeline records fatal merge failure when post-merge tests fail', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ctx-dev-pipeline-'));
  let testCall = 0;
  try {
    setupEnv(root);
    const { createDevelopmentPipeline } = await loadPipelineModule();

    const pipeline = createDevelopmentPipeline({
      runParallelFn: async () => ({
        status: 'success',
        durationMs: 20,
        summary: { total: 1, completed: 1, failed: 0 },
        results: [{ agentId: 'agent-a', status: 'completed', durationMs: 10 }],
      }),
      mergeWorktreeFn: async () => ({ success: true, conflicts: false, mergedCommits: 1 }),
      removeWorktreeFn: async () => {},
      runTestsFn: async () => {
        testCall++;
        if (testCall === 1) {
          return { success: false, skipped: false, output: 'fail', exitCode: 1, durationMs: 5 };
        }
        return { success: true, skipped: false, output: 'ok', exitCode: 0, durationMs: 5 };
      },
      resolveConflictsFn: async () => ({ success: true }),
      gitFn: async () => ({ success: true, stdout: '', stderr: '' }),
      getChangedFilesFn: async () => ['agent-a.js'],
    });

    const result = await pipeline.run([
      { agentId: 'agent-a', task: 'a', provider: 'claude' },
    ]);

    assert.equal(result.steps['merge:agent-a'].status, 'failed');
    assert.equal(result.steps['merge:agent-a'].failureKind, 'fatal');
  } finally {
    restoreEnv();
    rmSync(root, { recursive: true, force: true });
  }
});

test('development pipeline exposes failed task record when no agents complete successfully', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ctx-dev-pipeline-'));
  try {
    setupEnv(root);
    const { createDevelopmentPipeline } = await loadPipelineModule();

    const pipeline = createDevelopmentPipeline({
      runParallelFn: async () => ({
        status: 'failed',
        durationMs: 20,
        summary: { total: 1, completed: 0, failed: 1 },
        results: [{ agentId: 'agent-a', status: 'failed', durationMs: 10 }],
      }),
      mergeWorktreeFn: async () => ({ success: false, conflicts: false, mergedCommits: 0 }),
      removeWorktreeFn: async () => {},
      runTestsFn: async () => ({ success: true, skipped: true, output: '', exitCode: null, durationMs: 0 }),
      resolveConflictsFn: async () => ({ success: false, error: 'unused' }),
      gitFn: async () => ({ success: true, stdout: '', stderr: '' }),
      getChangedFilesFn: async () => ['agent-a.js'],
    });

    const result = await pipeline.run([
      { agentId: 'agent-a', task: 'a', provider: 'claude' },
    ]);

    assert.equal(result.status, 'failed');
    assert.equal(result.task.status, 'failed');
    assert.equal(result.task.failureKind, 'fatal');
    assert.equal(result.steps.execute_agents.status, 'failed');
  } finally {
    restoreEnv();
    rmSync(root, { recursive: true, force: true });
  }
});

test('development pipeline auto-detects the main base branch for real git repos', async () => {
  const root = createTempGitRepo('ctx-dev-pipeline-main-', { defaultBranch: 'main' });
  try {
    setupEnv(root);
    const { createDevelopmentPipeline } = await loadPipelineModule();

    const pipeline = createDevelopmentPipeline({
      runParallelFn: async () => ({
        status: 'success',
        durationMs: 20,
        summary: { total: 1, completed: 1, failed: 0 },
        results: [{ agentId: 'agent-a', status: 'completed', durationMs: 10 }],
      }),
      mergeWorktreeFn: async () => ({ success: true, conflicts: false, mergedCommits: 1 }),
      removeWorktreeFn: async () => {},
      runTestsFn: async () => ({ success: true, skipped: false, output: 'ok', exitCode: 0, durationMs: 5 }),
      resolveConflictsFn: async () => ({ success: true }),
      getChangedFilesFn: async () => ['agent-a.js'],
    });

    const result = await pipeline.run([
      { agentId: 'agent-a', task: 'a', provider: 'claude' },
    ]);

    assert.equal(result.status, 'success');
    assert.equal(result.task.metadata.baseBranch, 'main');
    assert.equal(getCurrentBranch(root), 'main');
  } finally {
    restoreEnv();
    rmSync(root, { recursive: true, force: true });
  }
});
