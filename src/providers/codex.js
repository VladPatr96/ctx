/**
 * Codex CLI provider adapter.
 * codex exec --ephemeral --skip-git-repo-check "prompt"
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
          inputTokens: parsed.usage.input_tokens || parsed.usage.inputTokens || parsed.usage.prompt_tokens || 0,
          outputTokens: parsed.usage.output_tokens || parsed.usage.outputTokens || parsed.usage.completion_tokens || 0
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
  name: 'codex',
  transport: 'bash',
  get models() { return getModelIds('codex'); },
  get modelInfo() { return discoverModels('codex'); },
  capabilities: ['bash', 'exec'],
  strengths: ['code_review', 'sandbox_exec', 'refactoring', 'diff_apply'],
  bestFor: {
    'code_review': 'Code review с изолированным анализом',
    'sandbox_exec': 'Безопасное выполнение скриптов в sandbox',
    'refactoring': 'Рефакторинг с apply diffs',
    'diff_apply': 'Применение патчей и изменений к коду'
  },

  async invoke(prompt, opts = {}) {
    const timeout = opts.timeout || 60000;
    const requestedModel = opts.model ? String(opts.model).trim() : null;
    const args = ['exec', '--ephemeral', '--skip-git-repo-check'];
    if (requestedModel) args.push('--model', requestedModel);
    args.push(String(prompt));
    const result = await runCliWithFallback('codex', args, {
      timeout,
      cwd: opts.cwd || process.cwd()
    });

    if (!result.success) {
      const msg = result.error || '';
      if (msg.includes('stdin is not a terminal')) {
        return {
          status: 'error',
          error: 'terminal_required',
          detail: buildDetail(result) || 'Codex requires a terminal'
        };
      }
      return { status: 'error', error: msg || 'codex_invoke_failed', detail: buildDetail(result) };
    }

    // Extract token usage from response if available
    const usage = extractTokenUsage(result.stdout, result.stderr);

    return {
      status: 'success',
      response: result.stdout,
      model: requestedModel || 'gpt-4o',
      ...(usage && {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      })
    };
  },

  async review(files, opts = {}) {
    const timeout = opts.timeout || 120000;
    const fileList = Array.isArray(files) ? files.join(' ') : files;
    const prompt = `Review these files for bugs, style issues, and improvements: ${fileList}`;
    const requestedModel = opts.model ? String(opts.model).trim() : null;
    const args = ['exec', '--ephemeral', '--skip-git-repo-check'];
    if (requestedModel) args.push('--model', requestedModel);
    args.push(prompt);

    const result = await runCommand(
      'codex',
      args,
      { timeout, cwd: opts.cwd || process.cwd() }
    );

    if (!result.success) {
      const msg = result.error || '';
      if (msg.includes('stdin is not a terminal')) {
        return {
          status: 'error',
          error: 'terminal_required',
          detail: buildDetail(result) || 'Codex requires a terminal'
        };
      }
      return { status: 'error', error: msg || 'codex_review_failed', detail: buildDetail(result) };
    }

    // Extract token usage from response if available
    const usage = extractTokenUsage(result.stdout, result.stderr);

    return {
      status: 'success',
      response: result.stdout,
      model: requestedModel || 'gpt-4o',
      ...(usage && {
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens
      })
    };
  },

  async healthCheck() {
    const result = await runCommand('codex', ['--version'], { timeout: 5000 });
    return result.success
      ? { available: true }
      : { available: false, reason: 'codex CLI not found' };
  }
};

