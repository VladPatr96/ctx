/**
 * OpenCode CLI provider adapter.
 * Primary: opencode run "prompt"
 * Fallback: opencode --model "<model>" "prompt"
 */

import { runCommand, runCliWithFallback, buildDetail } from '../utils/shell.js';
import { discoverModels, getModelIds } from './model-discovery.js';

const PRIMARY_GLM_MODEL = 'opencode/glm-4.7';
const FALLBACK_GLM_MODEL = 'zai-coding-plan/glm-4.7';
const KIMI_MODEL = 'opencode/kimi-k2.5';

export default {
  name: 'opencode',
  transport: 'mcp',
  get models() { return getModelIds('opencode'); },
  get modelInfo() { return discoverModels('opencode'); },
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
    const requestedModel = opts.model ? normalizeModel(opts.model) : null;
    const args = ['run', String(prompt), '--format', 'json'];
    if (requestedModel) args.push('--model', requestedModel);

    let result = await runCliWithFallback('opencode', args, {
      timeout,
      cwd: opts.cwd || process.cwd()
    });
    let modelUsed = requestedModel;

    if (!result.success && shouldRetryWithCodingPlan(requestedModel)) {
      const retryArgs = ['run', String(prompt), '--format', 'json', '--model', FALLBACK_GLM_MODEL];
      const retry = await runCliWithFallback('opencode', retryArgs, {
        timeout,
        cwd: opts.cwd || process.cwd()
      });

      if (retry.success) {
        result = retry;
        modelUsed = FALLBACK_GLM_MODEL;
      } else {
        result = retry;
      }
    }

    if (!result.success) {
      const direct = await tryDirectMode(prompt, modelUsed, {
        timeout,
        cwd: opts.cwd || process.cwd()
      });
      if (direct.success) {
        const response = pickOutput(direct);
        if (!response) {
          return {
            status: 'error',
            error: 'empty_response',
            detail: 'OpenCode returned success with empty stdout/stderr (direct mode)'
          };
        }
        if (looksLikeCliError(response)) {
          return {
            status: 'error',
            error: 'opencode_cli_error',
            detail: response.slice(0, 2000)
          };
        }
        return {
          status: 'success',
          response,
          model: modelUsed || null
        };
      }

      return {
        status: 'error',
        error: result.error || direct.error || 'opencode_invoke_failed',
        detail: [buildDetail(result), buildDetail(direct)].filter(Boolean).join('\n--- direct mode retry ---\n') || null
      };
    }
    const response = pickOutput(result);
    if (!response) {
      return {
        status: 'error',
        error: 'empty_response',
        detail: 'OpenCode returned success with empty stdout/stderr'
      };
    }
    if (looksLikeCliError(response)) {
      return {
        status: 'error',
        error: 'opencode_cli_error',
        detail: response.slice(0, 2000)
      };
    }
    return {
      status: 'success',
      response,
      model: modelUsed || null
    };
  },

  async healthCheck() {
    const result = await runCommand('opencode', ['--version'], { timeout: 30000 });
    return result.success
      ? { available: true }
      : { available: false, reason: 'opencode CLI not found or timed out' };
  }
};

function normalizeModel(model) {
  const raw = String(model).trim().toLowerCase();
  if (raw === 'kimi-k2-5' || raw === 'kimi-k2.5' || raw === 'opencode/kimi-k2-5') return KIMI_MODEL;
  if (raw.includes('/')) return raw;
  if (raw === 'glm-4.7') return PRIMARY_GLM_MODEL;
  return `opencode/${raw}`;
}


function shouldRetryWithCodingPlan(model) {
  if (!model) return false;
  return model === PRIMARY_GLM_MODEL || model === 'glm-4.7';
}

async function tryDirectMode(prompt, model, opts) {
  const args = [];
  if (model) {
    args.push('--model', model);
  }
  args.push(String(prompt));
  return runCliWithFallback('opencode', args, opts);
}

function pickOutput(result) {
  const stdout = typeof result?.stdout === 'string' ? result.stdout.trim() : '';
  const stderr = typeof result?.stderr === 'string' ? result.stderr.trim() : '';
  return stdout || stderr || '';
}

function looksLikeCliError(text) {
  const stripped = String(text || '').replace(/\u001b\[[0-9;]*m/g, '').trim();
  return /^Error:\s+/i.test(stripped) || /\bFailed to change directory\b/i.test(stripped);
}
