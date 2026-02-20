/**
 * Claude Code provider adapter.
 * Используется через Task tool внутри Claude Code сессии.
 * Для внешнего вызова — через claude CLI.
 */

import { runCommand } from '../utils/shell.js';

export default {
  name: 'claude',
  transport: 'native',
  models: ['opus-4.6', 'sonnet-4.6'],
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
      return buildInvokeError(result);
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

function buildInvokeError(result) {
  const raw = result.rawError || {};
  const detailParts = [
    typeof raw.stderr === 'string' ? raw.stderr.trim() : '',
    typeof raw.stdout === 'string' ? raw.stdout.trim() : ''
  ].filter(Boolean);

  return {
    status: 'error',
    error: result.error || 'claude_invoke_failed',
    detail: detailParts.join('\n').slice(0, 2000) || result.error || null
  };
}

async function runCliWithFallback(command, args, opts) {
  const first = await runCommand(command, args, { ...opts, shell: false });
  if (!first.success && String(first.error || '').includes('ENOENT')) {
    return runCommand(command, args, { ...opts, shell: true });
  }
  return first;
}
