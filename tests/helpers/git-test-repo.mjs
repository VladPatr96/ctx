import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function execGit(args, opts = {}) {
  return execFileSync('git', args, {
    encoding: 'utf-8',
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  });
}

export function createTempGitRepo(prefix = 'ctx-git-test-', opts = {}) {
  const { defaultBranch = 'master' } = opts;
  const dir = mkdtempSync(join(tmpdir(), prefix));

  execGit(['-c', `init.defaultBranch=${defaultBranch}`, 'init', dir]);
  execGit(['config', 'user.email', 'test@test.com'], { cwd: dir });
  execGit(['config', 'user.name', 'Test'], { cwd: dir });
  execGit(['config', 'core.autocrlf', 'false'], { cwd: dir });
  execGit(['config', 'core.safecrlf', 'false'], { cwd: dir });
  execGit(['config', 'commit.gpgsign', 'false'], { cwd: dir });

  writeFileSync(join(dir, '.gitignore'), '.data/\n.worktrees/\n', 'utf8');
  execGit(['add', '.gitignore'], { cwd: dir });
  execGit(['commit', '--quiet', '-m', 'init'], { cwd: dir });

  return dir;
}

export function getCurrentBranch(repoDir) {
  return execGit(['branch', '--show-current'], { cwd: repoDir }).trim();
}

export function getStatusShort(repoDir) {
  return execGit(['status', '--short'], { cwd: repoDir }).trim();
}
