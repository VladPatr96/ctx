/**
 * Gemini CLI provider adapter.
 * gemini -p "prompt" -o text
 */

import { runCommand, runCommandShell, shellEscape, buildDetail } from '../core/utils/shell.js';
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
          inputTokens: parsed.usage.input_tokens || parsed.usage.inputTokens || parsed.usage.promptTokenCount || 0,
          outputTokens: parsed.usage.output_tokens || parsed.usage.outputTokens || parsed.usage.candidatesTokenCount || 0
        };
      }
    }
  } catch { /* not JSON */ }

  // Try common text patterns
  const inputMatch = combined.match(/(\d+)\s*(?:input|prompt)\s*tokens?/i);
  const outputMatch = combined.match(/(\d+)\s*(?:output|completion|response|candidates?)\s*tokens?/i);

  if (inputMatch || outputMatch) {
    return {
      inputTokens: inputMatch ? parseInt(inputMatch[1], 10) : 0,
      outputTokens: outputMatch ? parseInt(outputMatch[1], 10) : 0
    };
  }

  return null;
}

export default {
  name: 'gemini',
  transport: 'mcp',
  get models() { return getModelIds('gemini'); },
  get modelInfo() { return discoverModels('gemini'); },
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
    const requestedModel = opts.model ? normalizeModel(opts.model) : null;
    const modelFlag = requestedModel ? ` --model ${requestedModel}` : '';
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

    // Extract token usage from response if available
    const usage = extractTokenUsage(result.stdout, result.stderr);

    return {
      status: 'success',
      response: result.stdout,
      model: requestedModel || 'gemini-2.0-flash-exp',
      ...(usage && {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      })
    };
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


