/**
 * Gemini CLI provider adapter.
 * gemini -p "prompt" -o text
 */

import { runCommand } from '../utils/shell.js';

export default {
  name: 'gemini',
  transport: 'mcp',
  models: ['gemini-3-pro-preview', 'gemini-3-flash-preview'],
  capabilities: ['mcp', 'skills', 'extensions'],
  strengths: ['large_context', 'codebase_analysis', 'documentation', 'translation'],
  bestFor: {
    'large_context': 'Анализ больших файлов и кодовых баз (1M+ контекст)',
    'codebase_analysis': 'Полный аудит проекта, поиск паттернов',
    'documentation': 'Генерация документации из кода',
    'translation': 'Перевод и i18n (весь проект в контексте)'
  },

  async invoke(prompt, opts = {}) {
    const timeout = opts.timeout || 60000;
    const args = ['-p', String(prompt), '-o', 'text'];
    if (opts.model) args.push('--model', normalizeModel(opts.model));

    const result = await runCliWithFallback('gemini', args, {
      timeout,
      cwd: opts.cwd || process.cwd()
    });

    if (!result.success) {
      const msg = result.error || '';
      if (msg.includes('429') || msg.includes('CAPACITY')) {
        return { status: 'error', error: 'rate_limit', detail: buildDetail(result) || 'MODEL_CAPACITY_EXHAUSTED' };
      }
      return {
        status: 'error',
        error: msg || 'gemini_invoke_failed',
        detail: buildDetail(result)
      };
    }
    return { status: 'success', response: result.stdout };
  },

  async healthCheck() {
    const result = await runCommand('gemini', ['--version'], { timeout: 30000 });
    return result.success
      ? { available: true }
      : { available: false, reason: 'gemini CLI not found or timed out' };
  }
};

function normalizeModel(model) {
  const raw = String(model).trim();
  if (raw.startsWith('google/')) return raw.slice('google/'.length);
  return raw;
}

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
