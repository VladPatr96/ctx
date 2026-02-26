/**
 * Gemini CLI provider adapter.
 * gemini -p "prompt" -o text
 */

import { runCommand, runCommandShell, shellEscape, buildDetail } from '../utils/shell.js';

export default {
  name: 'gemini',
  transport: 'mcp',
  models: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview'],
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
    // Build command string with proper quoting to avoid Windows shell arg splitting.
    // spawn(cmdString, [], {shell:true}) passes the whole string to cmd.exe.
    const escaped = shellEscape(String(prompt));
    const modelFlag = opts.model ? ` --model ${normalizeModel(opts.model)}` : '';
    const cmd = `gemini -p "${escaped}" -o text${modelFlag}`;

    const result = await runCommandShell(cmd, { timeout, cwd: opts.cwd || process.cwd() });

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


