/**
 * Claude Code provider adapter.
 * Используется через Task tool внутри Claude Code сессии.
 * Для внешнего вызова — через claude CLI.
 */

import { execSync } from 'node:child_process';

export default {
  name: 'claude',
  transport: 'native',
  models: ['opus', 'sonnet', 'haiku'],
  capabilities: ['mcp', 'skills', 'hooks', 'agents'],
  strengths: ['orchestration', 'planning', 'workflow', 'multi_step', 'agents'],
  bestFor: {
    'orchestration': 'Координация мульти-шаговых задач через Task tool и agents',
    'planning': 'Планирование архитектуры, декомпозиция задач (Plan mode)',
    'workflow': 'Построение pipeline: hooks, pre/post обработка',
    'multi_step': 'Сложные задачи с зависимостями между шагами',
    'agents': 'Оркестрация субагентов для параллельной работы'
  },

  async invoke(prompt, opts = {}) {
    const timeout = opts.timeout || 60000;
    try {
      const modelFlag = opts.model ? ` --model ${opts.model}` : '';
      const result = execSync(
        `claude -p "${prompt.replace(/"/g, '\\"')}"${modelFlag}`,
        { encoding: 'utf-8', timeout, cwd: opts.cwd || process.cwd() }
      );
      return { status: 'success', response: result.trim() };
    } catch (err) {
      return { status: 'error', error: err.message };
    }
  },

  async healthCheck() {
    try {
      execSync('claude --version', { encoding: 'utf-8', timeout: 5000 });
      return { available: true };
    } catch {
      return { available: false, reason: 'claude CLI not found' };
    }
  }
};
