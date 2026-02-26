import { execFile, execFileSync, spawn } from 'node:child_process';
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

const isWin = process.platform === 'win32';

function getEnv(opts) {
  const env = Object.assign({}, process.env, opts.env || {});
  // Allow nested CLI invocations from inside Claude Code sessions
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_ENTRYPOINT;
  if (isWin) {
    // Force specific user paths for CLI tools
    const userNpm = "C:\\Users\\\u041F\u0430\u0442\u0440\u0430\u0432\u0430\u0435\u0432\\AppData\\Roaming\\npm";
    const userLocal = "C:\\Users\\\u041F\u0430\u0442\u0440\u0430\u0432\u0430\u0435\u0432\\.local\\bin";
    
    let pathKey = "PATH";
    for (const key in env) {
      if (key.toUpperCase() === "PATH") {
        pathKey = key;
        break;
      }
    }
    
    const paths = (env[pathKey] || "").split(";").filter(Boolean);
    if (!paths.includes(userNpm)) paths.unshift(userNpm);
    if (!paths.includes(userLocal)) paths.unshift(userLocal);
    
    env[pathKey] = paths.join(";");
  }
  return env;
}

export async function runCommand(command, args = [], opts = {}) {
  try {
    const { stdout, stderr } = await execFileP(command, normalizeArgs(args), {
      cwd: opts.cwd || process.cwd(),
      timeout: opts.timeout || 30000,
      encoding: 'utf-8',
      shell: opts.shell !== undefined ? opts.shell : false,
      maxBuffer: opts.maxBuffer || DEFAULT_MAX_BUFFER,
      env: getEnv(opts)
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

/**
 * Run a pre-built command string via shell (spawn).
 * Use when you need full control over quoting (e.g. prompts with special chars).
 * The caller is responsible for proper escaping within the command string.
 */
export function runCommandShell(commandString, opts = {}) {
  return new Promise((resolve) => {
    const child = spawn(commandString, [], {
      cwd: opts.cwd || process.cwd(),
      shell: true,
      env: getEnv(opts),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '', stderr = '', settled = false;
    const done = (result) => { if (!settled) { settled = true; resolve(result); } };

    const timer = setTimeout(() => {
      child.kill();
      // If we collected stdout before timeout, treat as success
      // (some CLIs keep MCP connections alive and never exit cleanly)
      if (stdout.trim()) {
        done({ success: true, stdout: stdout.trim(), stderr: stderr.trim() });
      } else {
        done({ success: false, error: 'timeout' });
      }
    }, opts.timeout || 30000);

    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });

    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 || code === null) {
        done({ success: true, stdout: stdout.trim(), stderr: stderr.trim() });
      } else {
        done({ success: false, error: (stderr || stdout || '').trim() || `Exit code ${code}` });
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      done({ success: false, error: err.message });
    });

    // Close stdin immediately so the child doesn't wait for input
    child.stdin.end();
  });
}

export function runCommandSync(command, args = [], opts = {}) {
  try {
    const stdout = execFileSync(command, normalizeArgs(args), {
      cwd: opts.cwd || process.cwd(),
      timeout: opts.timeout || 30000,
      encoding: 'utf-8',
      shell: opts.shell !== undefined ? opts.shell : false,
      maxBuffer: opts.maxBuffer || DEFAULT_MAX_BUFFER,
      env: getEnv(opts)
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
