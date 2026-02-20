/**
 * Codex CLI provider adapter.
 * codex exec --ephemeral --skip-git-repo-check "prompt"
 */

import { runCommand } from '../utils/shell.js';

export default {
  name: 'codex',
  transport: 'bash',
  models: ['gpt-5.3-codex'],
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
    const model = opts.model ? String(opts.model).trim() : '';
    const args = ['exec', '--ephemeral', '--skip-git-repo-check'];
    if (model) args.push('--model', model);
    args.push(String(prompt));
    const result = await runCliWithFallback('codex', args, {
      timeout,
      cwd: opts.cwd || process.cwd()
    });

    if (!result.success) {
      const msg = result.error || '';
      if (msg.includes('stdin is not a terminal')) {
        return {
          status: 'error',
          error: 'terminal_required',
          detail: buildDetail(result) || 'Codex requires a terminal'
        };
      }
      return { status: 'error', error: msg || 'codex_invoke_failed', detail: buildDetail(result) };
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
        return {
          status: 'error',
          error: 'terminal_required',
          detail: buildDetail(result) || 'Codex requires a terminal'
        };
      }
      return { status: 'error', error: msg || 'codex_review_failed', detail: buildDetail(result) };
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

function buildDetail(result) {
  const raw = result.rawError || {};
  const detailParts = [
    typeof raw.stderr === 'string' ? raw.stderr.trim() : '',
    typeof raw.stdout === 'string' ? raw.stdout.trim() : ''
  ].filter(Boolean);
  return detailParts.join('\n').slice(0, 2000) || result.error || null;
}

async function runCliWithFallback(command, args, opts) {
  const first = await runCommand(command, args, { ...opts, shell: false });
  if (!first.success && String(first.error || '').includes('ENOENT')) {
    return runCommand(command, args, { ...opts, shell: true });
  }
  return first;
}
