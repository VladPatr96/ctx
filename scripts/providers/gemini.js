/**
 * Gemini CLI provider adapter.
 * gemini -p "prompt" -o text
 */

import { runCommand } from '../utils/shell.js';

export default {
  name: 'gemini',
  transport: 'mcp',
  models: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
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
    if (opts.model) args.push('--model', String(opts.model));

    const result = await runCommand('gemini', args, {
      timeout,
      cwd: opts.cwd || process.cwd()
    });

    if (!result.success) {
      const msg = result.error || '';
      if (msg.includes('429') || msg.includes('CAPACITY')) {
        return { status: 'error', error: 'rate_limit', detail: 'MODEL_CAPACITY_EXHAUSTED' };
      }
      return { status: 'error', error: msg };
    }
    return { status: 'success', response: result.stdout };
  },

  async healthCheck() {
    const result = await runCommand('gemini', ['--version'], { timeout: 5000 });
    return result.success
      ? { available: true }
      : { available: false, reason: 'gemini CLI not found' };
  }
};
