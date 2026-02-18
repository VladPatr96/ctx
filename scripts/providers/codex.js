/**
 * Codex CLI provider adapter.
 * codex exec --ephemeral --skip-git-repo-check "prompt"
 */

import { runCommand } from '../utils/shell.js';

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
    const result = await runCommand(
      'codex',
      ['exec', '--ephemeral', '--skip-git-repo-check', String(prompt)],
      { timeout, cwd: opts.cwd || process.cwd() }
    );

    if (!result.success) {
      const msg = result.error || '';
      if (msg.includes('stdin is not a terminal')) {
        return { status: 'error', error: 'terminal_required', detail: 'Codex requires a terminal' };
      }
      return { status: 'error', error: msg };
    }
    return { status: 'success', response: result.stdout };
  },

  async review(files, opts = {}) {
    const timeout = opts.timeout || 120000;
    const fileList = Array.isArray(files) ? files.join(' ') : files;
    const prompt = `Review these files for bugs, style issues, and improvements: ${fileList}`;
    const result = await runCommand(
      'codex',
      ['exec', '--ephemeral', '--skip-git-repo-check', prompt],
      { timeout, cwd: opts.cwd || process.cwd() }
    );

    if (!result.success) {
      const msg = result.error || '';
      if (msg.includes('stdin is not a terminal')) {
        return { status: 'error', error: 'terminal_required', detail: 'Codex requires a terminal' };
      }
      return { status: 'error', error: msg };
    }
    return { status: 'success', response: result.stdout };
  },

  async healthCheck() {
    const result = await runCommand('codex', ['--version'], { timeout: 5000 });
    return result.success
      ? { available: true }
      : { available: false, reason: 'codex CLI not found' };
  }
};
