/**
 * Claude Code provider adapter.
 * Используется через Task tool внутри Claude Code сессии.
 * Для внешнего вызова — через claude CLI.
 */

import { runCommand, runCliWithFallback, buildDetail } from '../core/utils/shell.js';
import { discoverModels, getModelIds } from './model-discovery.js';

/**
 * Extract token usage from CLI response.
 * Looks for patterns like "Usage: 123 input, 456 output tokens" or JSON with usage field.
 */
function extractTokenUsage(stdout, stderr) {
  const combined = `${stdout || ''}\n${stderr || ''}`;

  // Try JSON parsing first (some CLIs output JSON with usage)
  try {
    const jsonMatch = combined.match(/\{[\s\S]*"usage"[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.usage) {
        return {
          inputTokens: parsed.usage.input_tokens || parsed.usage.inputTokens || 0,
          outputTokens: parsed.usage.output_tokens || parsed.usage.outputTokens || 0
        };
      }
    }
  } catch { /* not JSON */ }

  // Try common text patterns
  const inputMatch = combined.match(/(\d+)\s*(?:input|prompt)\s*tokens?/i);
  const outputMatch = combined.match(/(\d+)\s*(?:output|completion|response)\s*tokens?/i);

  if (inputMatch || outputMatch) {
    return {
      inputTokens: inputMatch ? parseInt(inputMatch[1], 10) : 0,
      outputTokens: outputMatch ? parseInt(outputMatch[1], 10) : 0
    };
  }

  return null;
}

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
    const requestedModel = opts.model ? normalizeModel(opts.model) : null;
    if (requestedModel) args.push('--model', requestedModel);

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

    // Extract token usage from response if available
    const usage = extractTokenUsage(result.stdout, result.stderr);

    return {
      status: 'success',
      response: result.stdout,
      model: requestedModel || 'claude-sonnet-4-6', // fallback when no model specified
      ...(usage && {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      })
    };
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


