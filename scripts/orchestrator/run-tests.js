/**
 * Test runner — wrapper for executing test commands in pipeline context.
 * Uses runCommand from utils/shell.js.
 */

import { runCommand } from '../utils/shell.js';

/**
 * Run test command(s) sequentially (fail-fast).
 * @param {string|string[]} command — single command or array of commands
 * @param {object} opts
 * @param {string}  [opts.cwd]     — working directory
 * @param {number}  [opts.timeout] — per-command timeout in ms (default 60000)
 * @param {object}  [opts.env]     — extra env vars
 * @returns {{ success: boolean, skipped: boolean, output: string, exitCode: number|null, durationMs: number }}
 */
export async function runTests(command, opts = {}) {
  if (!command || (Array.isArray(command) && command.length === 0)) {
    return { success: true, skipped: true, output: '', exitCode: null, durationMs: 0 };
  }

  const commands = Array.isArray(command) ? command : [command];
  const { cwd, timeout = 60_000, env } = opts;
  const start = Date.now();
  const outputs = [];

  for (const cmd of commands) {
    const result = await runCommand(cmd, [], {
      cwd,
      timeout,
      env,
      shell: true,
    });

    const out = (result.stdout || '') + (result.stderr || '');
    outputs.push(out);

    if (!result.success) {
      return {
        success: false,
        skipped: false,
        output: outputs.join('\n---\n'),
        exitCode: result.rawError?.code ?? 1,
        durationMs: Date.now() - start,
      };
    }
  }

  return {
    success: true,
    skipped: false,
    output: outputs.join('\n---\n'),
    exitCode: 0,
    durationMs: Date.now() - start,
  };
}
