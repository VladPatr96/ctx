/**
 * OpenCode CLI provider adapter.
 * opencode run "prompt"
 */

import { execSync } from 'node:child_process';

export default {
  name: 'opencode',
  transport: 'mcp',
  capabilities: ['mcp', 'skills', 'agents'],

  async invoke(prompt, opts = {}) {
    const timeout = opts.timeout || 60000;
    try {
      const result = execSync(
        `opencode run "${prompt.replace(/"/g, '\\"')}" --format json`,
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
