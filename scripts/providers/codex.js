/**
 * Codex CLI provider adapter.
 * codex exec --ephemeral --skip-git-repo-check "prompt"
 */

import { execSync } from 'node:child_process';

export default {
  name: 'codex',
  transport: 'bash',
  models: ['default'],
  capabilities: ['bash', 'exec'],
  strengths: ['code_review', 'sandbox_exec', 'refactoring', 'diff_apply'],
  bestFor: {
    'code_review': 'Code review с изолированным анализом',
    'sandbox_exec': 'Безопасное выполнение скриптов в sandbox',
    'refactoring': 'Рефакторинг с apply diffs',
    'diff_apply': 'Применение патчей и изменений к коду'
  },

  async invoke(prompt, opts = {}) {
    const timeout = opts.timeout || 60000;
    try {
      const result = execSync(
        `codex exec --ephemeral --skip-git-repo-check "${prompt.replace(/"/g, '\\"')}"`,
        { encoding: 'utf-8', timeout, cwd: opts.cwd || process.cwd() }
      );
      return { status: 'success', response: result.trim() };
    } catch (err) {
      if (err.message.includes('stdin is not a terminal')) {
        return { status: 'error', error: 'terminal_required', detail: 'Codex requires a terminal' };
      }
      return { status: 'error', error: err.message };
    }
  },

  async review(files, opts = {}) {
    const timeout = opts.timeout || 120000;
    const fileList = Array.isArray(files) ? files.join(' ') : files;
    try {
      const result = execSync(
        `codex exec --ephemeral --skip-git-repo-check "Review these files for bugs, style issues, and improvements: ${fileList}"`,
        { encoding: 'utf-8', timeout, cwd: opts.cwd || process.cwd() }
      );
      return { status: 'success', response: result.trim() };
    } catch (err) {
      if (err.message.includes('stdin is not a terminal')) {
        return { status: 'error', error: 'terminal_required', detail: 'Codex requires a terminal' };
      }
      return { status: 'error', error: err.message };
    }
  },

  async healthCheck() {
    try {
      execSync('codex --version', { encoding: 'utf-8', timeout: 5000 });
      return { available: true };
    } catch {
      return { available: false, reason: 'codex CLI not found' };
    }
  }
};
