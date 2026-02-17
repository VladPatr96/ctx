/**
 * Claude Code provider adapter.
 * Используется через Task tool внутри Claude Code сессии.
 * Для внешнего вызова — через claude CLI.
 */

import { execSync } from 'node:child_process';

export default {
  name: 'claude',
  transport: 'native',
  capabilities: ['mcp', 'skills', 'hooks', 'agents'],

  async invoke(prompt, opts = {}) {
    const timeout = opts.timeout || 60000;
    try {
      const result = execSync(
        `claude -p "${prompt.replace(/"/g, '\\"')}"`,
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
