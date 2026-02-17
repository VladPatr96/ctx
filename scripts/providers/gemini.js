/**
 * Gemini CLI provider adapter.
 * gemini -p "prompt" -o text
 */

import { execSync } from 'node:child_process';

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
    try {
      const modelFlag = opts.model ? ` --model ${opts.model}` : '';
      const result = execSync(
        `gemini -p "${prompt.replace(/"/g, '\\"')}" -o text${modelFlag}`,
        { encoding: 'utf-8', timeout, cwd: opts.cwd || process.cwd() }
      );
      return { status: 'success', response: result.trim() };
    } catch (err) {
      if (err.message.includes('429') || err.message.includes('CAPACITY')) {
        return { status: 'error', error: 'rate_limit', detail: 'MODEL_CAPACITY_EXHAUSTED' };
      }
      return { status: 'error', error: err.message };
    }
  },

  async healthCheck() {
    try {
      execSync('gemini --version', { encoding: 'utf-8', timeout: 5000 });
      return { available: true };
    } catch {
      return { available: false, reason: 'gemini CLI not found' };
    }
  }
};
