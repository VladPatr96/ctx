/**
 * Claude Code provider adapter.
 * Используется через Task tool внутри Claude Code сессии.
 * Для внешнего вызова — через claude CLI.
 */

import { runCommand, runCliWithFallback, buildDetail } from '../utils/shell.js';
import { discoverModels, getModelIds } from './model-discovery.js';

export default {
  name: 'claude',
  transport: 'native',
  get models() { return getModelIds('claude'); },
  get modelInfo() { return discoverModels('claude'); },
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
    const args = ['-p', String(prompt)];
    if (opts.model) args.push('--model', normalizeModel(opts.model));

    const result = await runCliWithFallback('claude', args, {
      timeout,
      cwd: opts.cwd || process.cwd()
    });

    if (!result.success) {
      return {
        status: 'error',
        error: result.error || 'claude_invoke_failed',
        detail: buildDetail(result)
      };
    }
    return { status: 'success', response: result.stdout };
  },

  async healthCheck() {
    const result = await runCommand('claude', ['--version'], { timeout: 5000 });
    return result.success
      ? { available: true }
      : { available: false, reason: 'claude CLI not found' };
  }
};

function normalizeModel(model) {
  const normalized = String(model).trim().toLowerCase();
  if (normalized === 'opus-4.6') return 'claude-opus-4-6';
  if (normalized === 'sonnet-4.6') return 'claude-sonnet-4-6';
  return String(model).trim();
}


