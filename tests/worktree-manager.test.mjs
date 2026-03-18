import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createTempGitRepo } from './helpers/git-test-repo.mjs';

// Must set env BEFORE importing the module (lazy getters read env)
const origRoot = process.env.CLAUDE_PLUGIN_ROOT;
const origData = process.env.CTX_DATA_DIR;

function createTempRepo(opts = {}) {
  return createTempGitRepo('wt-test-', opts);
}

function setupEnv(repoDir) {
  const dataDir = join(repoDir, '.data');
  process.env.CLAUDE_PLUGIN_ROOT = repoDir;
  process.env.CTX_DATA_DIR = dataDir;
}

function restoreEnv() {
  if (origRoot === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
  else process.env.CLAUDE_PLUGIN_ROOT = origRoot;
  if (origData === undefined) delete process.env.CTX_DATA_DIR;
  else process.env.CTX_DATA_DIR = origData;
}

// Dynamic import to pick up env at import time
async function loadModule() {
  // Force fresh import each time by using query param
  const id = Date.now() + Math.random();
  return import(`../src/orchestrator/worktree-manager.js?v=${id}`);
}

// ==================== Tests ====================

test('validateAgentId — valid names accepted', async () => {
  const { validateAgentId } = await loadModule();
  // Should not throw
  validateAgentId('claude');
  validateAgentId('agent-1');
  validateAgentId('my-agent-test');
  validateAgentId('a');
  validateAgentId('abc123');
});

test('validateAgentId — invalid names rejected', async () => {
  const { validateAgentId } = await loadModule();
  assert.throws(() => validateAgentId(''), /Invalid agent ID/);
  assert.throws(() => validateAgentId('UPPER'), /Invalid agent ID/);
  assert.throws(() => validateAgentId('-starts-dash'), /Invalid agent ID/);
  assert.throws(() => validateAgentId('has space'), /Invalid agent ID/);
  assert.throws(() => validateAgentId('../traversal'), /Invalid agent ID/);
  assert.throws(() => validateAgentId('a'.repeat(64)), /Invalid agent ID/);
});

test('createWorktree — lifecycle: create + verify directory + state', async () => {
  const repo = createTempRepo();
  try {
    setupEnv(repo);
    const mod = await loadModule();
    const result = await mod.createWorktree('test-agent');
    assert.equal(result.status, 'created');
    assert.equal(result.branchName, 'agent/test-agent');
    assert.ok(existsSync(result.worktreePath), 'Worktree directory should exist');

    // Verify branch exists
    const branches = execFileSync('git', ['branch'], { cwd: repo, encoding: 'utf-8' });
    assert.ok(branches.includes('agent/test-agent'), 'Branch should be created');
  } finally {
    restoreEnv();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('createWorktree — auto-detects main when baseBranch is omitted', async () => {
  const repo = createTempRepo({ defaultBranch: 'main' });
  try {
    setupEnv(repo);
    const mod = await loadModule();
    const result = await mod.createWorktree('main-agent');
    const status = await mod.getWorktree('main-agent');

    assert.equal(result.status, 'created');
    assert.equal(status.baseBranch, 'main');
  } finally {
    restoreEnv();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('createWorktree — duplicate rejected', async () => {
  const repo = createTempRepo();
  try {
    setupEnv(repo);
    const mod = await loadModule();
    await mod.createWorktree('dup-agent');
    await assert.rejects(
      () => mod.createWorktree('dup-agent'),
      /already exists/
    );
  } finally {
    restoreEnv();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('createWorktree — concurrent limit enforced', async () => {
  const repo = createTempRepo();
  try {
    setupEnv(repo);
    const mod = await loadModule();
    await mod.createWorktree('agent-a');
    await mod.createWorktree('agent-b');
    await mod.createWorktree('agent-c');
    await assert.rejects(
      () => mod.createWorktree('agent-d'),
      /limit reached/
    );
  } finally {
    restoreEnv();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('listWorktrees — returns enriched list', async () => {
  const repo = createTempRepo();
  try {
    setupEnv(repo);
    const mod = await loadModule();
    await mod.createWorktree('list-agent', { provider: 'claude', task: 'test task' });
    const result = await mod.listWorktrees();
    assert.equal(result.total, 1);
    assert.equal(result.active, 1);
    assert.equal(result.worktrees[0].agentId, 'list-agent');
    assert.equal(result.worktrees[0].provider, 'claude');
    assert.ok(result.worktrees[0].head, 'Should have HEAD hash');
  } finally {
    restoreEnv();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('getWorktree — returns detailed status with HEAD/dirty/drift', async () => {
  const repo = createTempRepo();
  try {
    setupEnv(repo);
    const mod = await loadModule();
    const created = await mod.createWorktree('status-agent');
    const status = await mod.getWorktree('status-agent');
    assert.equal(status.agentId, 'status-agent');
    assert.ok(status.head, 'Should have HEAD');
    assert.equal(status.dirty, false);
    assert.equal(typeof status.aheadBy, 'number');
    assert.equal(typeof status.behindBy, 'number');
  } finally {
    restoreEnv();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('removeWorktree — clean removal + state update', async () => {
  const repo = createTempRepo();
  try {
    setupEnv(repo);
    const mod = await loadModule();
    const created = await mod.createWorktree('remove-agent');
    const result = await mod.removeWorktree('remove-agent');
    assert.equal(result.removed, true);
    assert.equal(result.branchDeleted, true);

    // Verify worktree dir is gone
    assert.ok(!existsSync(created.worktreePath), 'Worktree directory should be removed');

    // Verify state is updated
    const list = await mod.listWorktrees();
    const entry = list.worktrees.find(w => w.agentId === 'remove-agent');
    assert.equal(entry.status, 'removed');
  } finally {
    restoreEnv();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('getDrift — accurate ahead/behind counts', async () => {
  const repo = createTempRepo();
  try {
    setupEnv(repo);
    const mod = await loadModule();
    const created = await mod.createWorktree('drift-agent');

    // Add a commit in the worktree
    const wtPath = created.worktreePath;
    execFileSync('git', ['commit', '--allow-empty', '-m', 'agent commit 1'], { cwd: wtPath, encoding: 'utf-8' });
    execFileSync('git', ['commit', '--allow-empty', '-m', 'agent commit 2'], { cwd: wtPath, encoding: 'utf-8' });

    const drift = await mod.getDrift('drift-agent');
    assert.equal(drift.aheadBy, 2);
    assert.equal(drift.behindBy, 0);
  } finally {
    restoreEnv();
    rmSync(repo, { recursive: true, force: true });
  }
});

test('mergeWorktree — successful merge + state = merged', async () => {
  const repo = createTempRepo();
  try {
    setupEnv(repo);
    const mod = await loadModule();
    const created = await mod.createWorktree('merge-agent');

    // Add a commit in the worktree
    const wtPath = created.worktreePath;
    execFileSync('git', ['commit', '--allow-empty', '-m', 'feature commit'], { cwd: wtPath, encoding: 'utf-8' });

    // Need to remove worktree first before merging (git won't merge a checked-out branch)
    // Instead, remove worktree but keep branch, then merge
    await mod.removeWorktree('merge-agent', { deleteBranch: false });

    // Re-register as active to test merge (simulate the flow)
    // Actually the plan says mergeWorktree checks active status, let's create a new one
    // and use a different approach - create worktree, commit, then merge

    // Let's restart: create fresh worktree
    const created2 = await mod.createWorktree('merge-agent2');
    const wtPath2 = created2.worktreePath;
    execFileSync('git', ['commit', '--allow-empty', '-m', 'feature work'], { cwd: wtPath2, encoding: 'utf-8' });

    // For merge to work, we first need to remove the worktree so the branch isn't checked out
    // But our mergeWorktree expects status=active. The merge needs the branch to exist but not be checked out.
    // Actually git merge works on branches, the worktree checkout doesn't block merge --no-ff from main repo.
    // The main repo is on master, merging agent/merge-agent2 branch into it.
    // But git won't allow merging a branch that's currently checked out in another worktree... actually it should work
    // because we're merging INTO master from the main repo, not checking out the agent branch.

    const result = await mod.mergeWorktree('merge-agent2');
    assert.equal(result.success, true);
    assert.equal(result.conflicts, false);
    assert.ok(result.mergedCommits >= 1, 'Should have merged at least 1 commit');

    // Verify state
    const list = await mod.listWorktrees();
    const entry = list.worktrees.find(w => w.agentId === 'merge-agent2');
    assert.equal(entry.status, 'merged');
  } finally {
    restoreEnv();
    rmSync(repo, { recursive: true, force: true });
  }
});
