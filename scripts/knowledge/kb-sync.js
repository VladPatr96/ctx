/**
 * kb-sync.js — Git synchronization for knowledge base.
 *
 * Syncs ~/.config/ctx/knowledge/ with VladPatr96/ctx-knowledge repo.
 * - ensureRepo(): clone or create repo on first run
 * - pull(): background git pull --rebase at session start
 * - push(): git add + commit + push on session save
 * - isClean(): check for uncommitted changes
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';
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
    const gitDir = join(this.repoDir, '.git');
    if (existsSync(gitDir)) return { status: 'exists' };

    // Try to clone existing repo
    const clone = await runCommand('gh', [
      'repo', 'clone', this.repoName, this.repoDir
    ], { timeout: 30000 });

    if (clone.success) return { status: 'cloned' };

    // Repo doesn't exist — create it
    const create = await runCommand('gh', [
      'repo', 'create', this.repoName, '--private', '--clone',
      '--description', 'CTX Knowledge Base'
    ], { timeout: 30000, cwd: this.repoDir });

    if (create.success) return { status: 'created' };

    // Fallback: init locally without remote
    if (!existsSync(this.repoDir)) {
      const { mkdirSync } = await import('node:fs');
      mkdirSync(this.repoDir, { recursive: true });
    }
    await runCommand('git', ['init'], { cwd: this.repoDir });
    return { status: 'local-only', warning: `Could not clone/create ${this.repoName}` };
  }

  /**
   * Pull latest changes (non-blocking, for session start).
   */
  async pull() {
    if (!this._hasGit()) return { status: 'no-git' };
    const result = await runCommand('git', [
      '-C', this.repoDir, 'pull', '--rebase', '--quiet'
    ], { timeout: 15000 });
    return { status: result.success ? 'ok' : 'error', error: result.error };
  }

  /**
   * Push changes (for session save).
   */
  async push(message = 'kb: update') {
    if (!this._hasGit()) return { status: 'no-git' };

    // Check if there are changes
    if (await this.isClean()) return { status: 'clean' };

    const add = await runCommand('git', ['-C', this.repoDir, 'add', '-A'], { timeout: 10000 });
    if (!add.success) return { status: 'error', step: 'add', error: add.error };

    const commit = await runCommand('git', [
      '-C', this.repoDir, 'commit', '-m', message
    ], { timeout: 10000 });
    if (!commit.success) return { status: 'error', step: 'commit', error: commit.error };

    const push = await runCommand('git', [
      '-C', this.repoDir, 'push', '--quiet'
    ], { timeout: 30000 });
    return { status: push.success ? 'ok' : 'push-failed', error: push.error };
  }

  /**
   * Check if the repo has no uncommitted changes.
   */
  async isClean() {
    const result = await runCommand('git', [
      '-C', this.repoDir, 'status', '--porcelain'
    ], { timeout: 5000 });
    return result.success && !result.stdout.trim();
  }

  _hasGit() {
    return existsSync(join(this.repoDir, '.git'));
  }
}

function parseBool(value) {
  if (typeof value !== 'string') return false;
  const n = value.trim().toLowerCase();
  return n === '1' || n === 'true' || n === 'yes';
}
