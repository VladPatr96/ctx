/**
 * OpenCode CLI provider adapter.
 * opencode run "prompt"
 */

import { runCommand } from '../utils/shell.js';

export default {
  name: 'opencode',
  transport: 'mcp',
  models: ['default'],
  capabilities: ['mcp', 'skills', 'agents'],
  strengths: ['multi_model', 'custom_providers', 'json_output', 'agents'],
  bestFor: {
    'multi_model': 'Задачи требующие разных моделей (GPT, Gemini, Claude)',
    'custom_providers': 'Работа с кастомными AI провайдерами',
    'json_output': 'Генерация структурированного JSON вывода',
    'agents': 'Кастомные агенты с TypeScript tools'
  },

  async invoke(prompt, opts = {}) {
    const timeout = opts.timeout || 60000;
    const args = ['run', String(prompt), '--format', 'json'];
    if (opts.model) args.push('--model', String(opts.model));

    const result = await runCommand('opencode', args, {
      timeout,
      cwd: opts.cwd || process.cwd()
    });

    if (!result.success) {
      return { status: 'error', error: result.error };
    }
    return { status: 'success', response: result.stdout };
  },

  async healthCheck() {
    const result = await runCommand('opencode', ['--version'], { timeout: 5000 });
    return result.success
      ? { available: true }
      : { available: false, reason: 'opencode CLI not found' };
  }
};
