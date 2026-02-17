/**
 * OpenCode CLI provider adapter.
 * opencode run "prompt"
 */

import { execSync } from 'node:child_process';

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
    try {
      const modelFlag = opts.model ? ` --model ${opts.model}` : '';
      const result = execSync(
        `opencode run "${prompt.replace(/"/g, '\\"')}" --format json${modelFlag}`,
        { encoding: 'utf-8', timeout, cwd: opts.cwd || process.cwd() }
      );
      return { status: 'success', response: result.trim() };
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  },

  async healthCheck() {
    try {
      execSync('opencode --version', { encoding: 'utf-8', timeout: 5000 });
      return { available: true };
    } catch {
      return { available: false, reason: 'opencode CLI not found' };
    }
  }
};
