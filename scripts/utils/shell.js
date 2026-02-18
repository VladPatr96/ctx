import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024;

function normalizeArgs(args) {
  if (!Array.isArray(args)) return [];
  return args.map(arg => String(arg));
}

function formatError(err) {
  if (!err) return 'Unknown command error';
  const stderr = typeof err.stderr === 'string' ? err.stderr.trim() : '';
  const stdout = typeof err.stdout === 'string' ? err.stdout.trim() : '';
  if (stderr) return stderr;
  if (stdout) return stdout;
  return err.message || 'Unknown command error';
}

export async function runCommand(command, args = [], opts = {}) {
  try {
    const { stdout, stderr } = await execFileP(command, normalizeArgs(args), {
      cwd: opts.cwd || process.cwd(),
      timeout: opts.timeout || 15000,
      encoding: 'utf-8',
      shell: false,
      maxBuffer: opts.maxBuffer || DEFAULT_MAX_BUFFER,
      env: opts.env || process.env
    });
    return {
      success: true,
      stdout: (stdout || '').trim(),
      stderr: (stderr || '').trim()
    };
  } catch (err) {
    return {
      success: false,
      error: formatError(err),
      rawError: err
    };
  }
}

export function runCommandSync(command, args = [], opts = {}) {
  try {
    const stdout = execFileSync(command, normalizeArgs(args), {
      cwd: opts.cwd || process.cwd(),
      timeout: opts.timeout || 15000,
      encoding: 'utf-8',
      shell: false,
      maxBuffer: opts.maxBuffer || DEFAULT_MAX_BUFFER,
      env: opts.env || process.env
    });
    return {
      success: true,
      stdout: (stdout || '').trim()
    };
  } catch (err) {
    return {
      success: false,
      error: formatError(err),
      rawError: err
    };
  }
}
