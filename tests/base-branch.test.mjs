import test from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { createTempGitRepo } from './helpers/git-test-repo.mjs';
import { detectBaseBranch, resolveBaseBranch } from '../src/orchestrator/base-branch.js';

test('detectBaseBranch prefers a local main branch when present', async () => {
  const repo = createTempGitRepo('ctx-base-branch-main-', { defaultBranch: 'main' });
  try {
    const branch = await detectBaseBranch({ cwd: repo });
    assert.equal(branch, 'main');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('detectBaseBranch falls back to the current branch when no main or master exists', async () => {
  const repo = createTempGitRepo('ctx-base-branch-trunk-', { defaultBranch: 'trunk' });
  try {
    const branch = await detectBaseBranch({ cwd: repo });
    assert.equal(branch, 'trunk');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('resolveBaseBranch preserves an explicit branch override', async () => {
  const repo = createTempGitRepo('ctx-base-branch-explicit-', { defaultBranch: 'main' });
  try {
    const branch = await resolveBaseBranch('release/1.1', { cwd: repo });
    assert.equal(branch, 'release/1.1');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
