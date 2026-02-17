/**
 * Gemini CLI provider adapter.
 * gemini -p "prompt" -o text
 */

import { execSync } from 'node:child_process';

export default {
  name: 'gemini',
  transport: 'mcp',
  capabilities: ['mcp', 'skills', 'extensions'],

  async invoke(prompt, opts = {}) {
    const timeout = opts.timeout || 60000;
    try {
      const result = execSync(
        `gemini -p "${prompt.replace(/"/g, '\\"')}" -o text`,
        { encoding: 'utf-8', timeout, cwd: opts.cwd || process.cwd() }
      );
      return { status: 'success', response: result.trim() };
    } catch (err) {
      if (err.message.includes('429') || err.message.includes('CAPACITY')) {
        return { status: 'error', error: 'rate_limit', detail: 'MODEL_CAPACITY_EXHAUSTED' };
      }
      return { status: 'error', error: err.message };
    }
  },

  async healthCheck() {
    try {
      execSync('gemini --version', { encoding: 'utf-8', timeout: 5000 });
      return { available: true };
    } catch {
      return { available: false, reason: 'gemini CLI not found' };
    }
  }
};
