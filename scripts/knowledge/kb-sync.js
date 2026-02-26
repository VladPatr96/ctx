/**
 * kb-sync.js — Git synchronization for knowledge base.
 *
 * Syncs ~/.config/ctx/knowledge/ with VladPatr96/ctx-knowledge repo.
 * - ensureRepo(): clone or create repo on first run
 * - pull(): background git pull --rebase at session start
 * - push(): git add + commit + push on session save
 * - isClean(): check for uncommitted changes
 */

import { existsSync, mkdirSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { runCommand, runCommandSync } from '../utils/shell.js';

const DEFAULT_REPO = 'VladPatr96/ctx-knowledge';

export class KbSync {
  constructor(options = {}) {
    this.repoDir = options.repoDir || join(
      process.env.HOME || process.env.USERPROFILE || '.',
      '.config', 'ctx', 'knowledge'
    );
    this.repoName = options.repoName || process.env.CTX_KB_REPO || DEFAULT_REPO;
    this.autoSync = !parseBool(process.env.CTX_KB_AUTO_SYNC === '0'
      ? '1' // inverted: CTX_KB_AUTO_SYNC=0 means disabled
      : process.env.CTX_KB_AUTO_SYNC || '');
  }

  /**
   * Ensure the knowledge repo exists locally.
   * Clones it or creates a new private repo if needed.
   */
  async ensureRepo() {
    if (!existsSync(this.repoDir)) {
      mkdirSync(this.repoDir, { recursive: true });
    }

    // Repair previously nested clone layout: <repoDir>/<repo-name>/.git
    const adopted = this._adoptNestedRepo();
    const existingGitRoot = this._resolveGitRoot();
    if (existingGitRoot) {
      return {
        status: 'exists',
        gitRoot: existingGitRoot,
        ...(adopted ? { adoptedNested: true, moved: adopted.moved, conflicts: adopted.conflicts } : {})
      };
    }

    // Try to clone existing repo
    const clone = await runCommand('gh', [
      'repo', 'clone', this.repoName, this.repoDir
    ], { timeout: 30000 });

    if (clone.success) {
      const adoptedAfterClone = this._adoptNestedRepo();
      const gitRoot = this._resolveGitRoot();
      return {
        status: 'cloned',
        gitRoot: gitRoot || this.repoDir,
        ...(adoptedAfterClone ? { adoptedNested: true, moved: adoptedAfterClone.moved, conflicts: adoptedAfterClone.conflicts } : {})
      };
    }

    // Repo doesn't exist — create it
    const create = await runCommand('gh', [
      'repo', 'create', this.repoName, '--private', '--clone',
      '--description', 'CTX Knowledge Base'
    ], { timeout: 30000, cwd: this.repoDir });

    if (create.success) {
      const adoptedAfterCreate = this._adoptNestedRepo();
      const gitRoot = this._resolveGitRoot();
      return {
        status: 'created',
        gitRoot: gitRoot || this.repoDir,
        ...(adoptedAfterCreate ? { adoptedNested: true, moved: adoptedAfterCreate.moved, conflicts: adoptedAfterCreate.conflicts } : {})
      };
    }

    // Fallback: init locally without remote
    await runCommand('git', ['init'], { cwd: this.repoDir });
    return { status: 'local-only', warning: `Could not clone/create ${this.repoName}` };
  }

  /**
   * Pull latest changes (non-blocking, for session start).
   */
  async pull() {
    const gitRoot = this._resolveGitRoot();
    if (!gitRoot) return { status: 'no-git' };
    let result = await runCommand('git', [
      '-C', gitRoot, 'pull', '--rebase', '--quiet'
    ], { timeout: 15000 });
    const pullError = String(result.error || '');
    if (!result.success && (/no tracking information/i.test(pullError) || /couldn't find remote ref/i.test(pullError))) {
      const branch = this._currentBranch(gitRoot);
      const remoteBranch = this._originDefaultBranch(gitRoot) || branch;
      if (remoteBranch) {
        result = await runCommand('git', [
          '-C', gitRoot, 'pull', '--rebase', '--quiet', 'origin', remoteBranch
        ], { timeout: 15000 });
        if (result.success) {
          await runCommand('git', [
            '-C', gitRoot, 'branch', '--set-upstream-to', `origin/${remoteBranch}`, branch || remoteBranch
          ], { timeout: 5000 });
        }
      }
    }
    if (!result.success && /couldn't find remote ref|no such ref was fetched/i.test(String(result.error || ''))) {
      const heads = runCommandSync('git', ['-C', gitRoot, 'ls-remote', '--heads', 'origin'], { timeout: 10000 });
      if (heads.success && !heads.stdout.trim()) {
        return { status: 'empty-remote' };
      }
    }
    return { status: result.success ? 'ok' : 'error', error: result.error };
  }

  /**
   * Push changes (for session save).
   */
  async push(message = 'kb: update') {
    const gitRoot = this._resolveGitRoot();
    if (!gitRoot) return { status: 'no-git' };

    // Check if there are changes
    if (await this.isClean()) return { status: 'clean' };

    const add = await runCommand('git', ['-C', gitRoot, 'add', '-A'], { timeout: 10000 });
    if (!add.success) return { status: 'error', step: 'add', error: add.error };

    const commit = await runCommand('git', [
      '-C', gitRoot, 'commit', '-m', message
    ], { timeout: 10000 });
    if (!commit.success) {
      if (String(commit.error || '').toLowerCase().includes('nothing to commit')) {
        return { status: 'clean' };
      }
      return { status: 'error', step: 'commit', error: commit.error };
    }

    const push = await runCommand('git', [
      '-C', gitRoot, 'push', '--quiet'
    ], { timeout: 30000 });
    if (push.success) return { status: 'ok' };

    if (/upstream branch|set upstream/i.test(String(push.error || ''))) {
      const branch = this._currentBranch(gitRoot);
      if (branch) {
        const retry = await runCommand('git', [
          '-C', gitRoot, 'push', '--set-upstream', 'origin', branch, '--quiet'
        ], { timeout: 30000 });
        return { status: retry.success ? 'ok' : 'push-failed', error: retry.error, setUpstream: true };
      }
    }

    return { status: 'push-failed', error: push.error };
  }

  /**
   * Check if the repo has no uncommitted changes.
   */
  async isClean() {
    const gitRoot = this._resolveGitRoot();
    if (!gitRoot) return false;
    const result = await runCommand('git', [
      '-C', gitRoot, 'status', '--porcelain'
    ], { timeout: 5000 });
    return result.success && !result.stdout.trim();
  }

  _hasGit() {
    return !!this._resolveGitRoot();
  }

  _currentBranch(gitRoot) {
    const result = runCommandSync('git', ['-C', gitRoot, 'branch', '--show-current'], { timeout: 5000 });
    return result.success ? result.stdout.trim() : '';
  }

  _originDefaultBranch(gitRoot) {
    const result = runCommandSync('git', [
      '-C', gitRoot, 'symbolic-ref', '-q', 'refs/remotes/origin/HEAD', '--short'
    ], { timeout: 5000 });
    if (result.success) {
      const branch = result.stdout.trim().replace(/^origin\//, '');
      if (branch) return branch;
    }

    const remoteHead = runCommandSync('git', [
      '-C', gitRoot, 'ls-remote', '--symref', 'origin', 'HEAD'
    ], { timeout: 10000 });
    if (!remoteHead.success) return '';
    const match = (remoteHead.stdout || '').match(/ref:\s+refs\/heads\/([^\s]+)\s+HEAD/);
    return match ? match[1] : '';
  }

  _resolveGitRoot() {
    const directGit = join(this.repoDir, '.git');
    if (existsSync(directGit)) return this.repoDir;

    const nestedDir = join(this.repoDir, repoLeaf(this.repoName));
    if (existsSync(join(nestedDir, '.git'))) return nestedDir;

    return null;
  }

  _adoptNestedRepo() {
    const nestedDir = join(this.repoDir, repoLeaf(this.repoName));
    if (!existsSync(join(nestedDir, '.git'))) return null;
    const rootGitDir = join(this.repoDir, '.git');

    // Repair case: root has a fallback local-only git repo, while nested dir has the real clone (.git only).
    if (existsSync(rootGitDir)) {
      const rootRemote = runCommandSync('git', ['-C', this.repoDir, 'remote'], { timeout: 5000 });
      const nestedRemote = runCommandSync('git', ['-C', nestedDir, 'remote'], { timeout: 5000 });
      const rootHasRemote = rootRemote.success && !!rootRemote.stdout.trim();
      const nestedHasRemote = nestedRemote.success && !!nestedRemote.stdout.trim();

      if (!rootHasRemote && nestedHasRemote) {
        rmSync(rootGitDir, { recursive: true, force: true });
        renameSync(join(nestedDir, '.git'), rootGitDir);
        try {
          if (readdirSync(nestedDir).length === 0) rmSync(nestedDir, { recursive: true, force: true });
        } catch { /* ignore */ }
        return { moved: ['.git'], conflicts: [], repairedFallbackGit: true };
      }

      return null;
    }

    const moved = [];
    const conflicts = [];
    for (const name of readdirSync(nestedDir)) {
      const from = join(nestedDir, name);
      const to = join(this.repoDir, name);
      if (existsSync(to)) {
        conflicts.push(name);
        continue;
      }
      renameSync(from, to);
      moved.push(name);
    }

    try {
      if (existsSync(nestedDir) && readdirSync(nestedDir).length === 0) {
        rmSync(nestedDir, { recursive: true, force: true });
      }
    } catch {
      // Best-effort cleanup only.
    }

    return { moved, conflicts };
  }
}

function parseBool(value) {
  if (typeof value !== 'string') return false;
  const n = value.trim().toLowerCase();
  return n === '1' || n === 'true' || n === 'yes';
}

function repoLeaf(repoName) {
  return basename(String(repoName || '').trim()) || 'repo';
}
