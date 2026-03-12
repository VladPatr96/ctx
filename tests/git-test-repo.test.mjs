import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createTempGitRepo,
  getCurrentBranch,
  getStatusShort,
} from './helpers/git-test-repo.mjs';

test('createTempGitRepo creates a clean master repo with ignored runtime directories', () => {
  const repo = createTempGitRepo('ctx-git-fixture-');
  try {
    assert.equal(getCurrentBranch(repo), 'master');
    assert.equal(getStatusShort(repo), '');

    mkdirSync(join(repo, '.data'), { recursive: true });
    mkdirSync(join(repo, '.worktrees', 'agent-a'), { recursive: true });
    writeFileSync(join(repo, '.data', 'pipeline.json'), '{}', 'utf8');
    writeFileSync(join(repo, '.worktrees', 'agent-a', 'note.txt'), 'test', 'utf8');

    assert.equal(getStatusShort(repo), '');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

test('createTempGitRepo supports a configurable default branch', () => {
  const repo = createTempGitRepo('ctx-git-fixture-main-', { defaultBranch: 'main' });
  try {
    assert.equal(getCurrentBranch(repo), 'main');
    assert.equal(getStatusShort(repo), '');
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});
