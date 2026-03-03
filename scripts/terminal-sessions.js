/**
 * Terminal Sessions Manager
 *
 * Spawns CLI processes (claude, gemini, codex, opencode) and streams
 * their stdout/stderr to SSE clients. Accepts stdin via POST.
 *
 * Windows-compatible: uses cmd /c for shell spawning.
 */

import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';

// Max sessions to prevent resource exhaustion
const MAX_SESSIONS = 10;
// Kill session after this many ms of inactivity (no subscribers)
const SESSION_IDLE_TTL_MS = 5 * 60 * 1000;
// Max output lines kept in ring buffer per session for replay
const OUTPUT_RING_SIZE = 200;
// Timeout to forcefully kill after SIGTERM (ms)
const KILL_TIMEOUT_MS = 5000;

/**
 * @typedef {Object} Session
 * @property {string} id
 * @property {string} provider - claude | gemini | codex | opencode
 * @property {string} model
 * @property {string} label
 * @property {string} branch
 * @property {'starting'|'running'|'idle'|'done'|'error'} status
 * @property {import('node:child_process').ChildProcess|null} process
 * @property {Array<{ts: string, type: 'stdout'|'stderr'|'system', text: string}>} ring
 * @property {Set<(line: object) => void>} subscribers
 * @property {NodeJS.Timeout|null} idleTimer
 * @property {number} startedAt
 */

/** @type {Map<string, Session>} */
const sessions = new Map();

function newId() {
  return randomBytes(8).toString('hex');
}

function resetIdleTimer(session) {
  if (session.idleTimer) clearTimeout(session.idleTimer);
  if (session.subscribers.size > 0) {
    session.idleTimer = null;
    return;
  }
  session.idleTimer = setTimeout(() => {
    if (session.subscribers.size === 0 && session.status !== 'done') {
      killSession(session.id, 'idle timeout');
    }
  }, SESSION_IDLE_TTL_MS);
}

function pushLine(session, type, text) {
  const line = { ts: new Date().toISOString(), type, text };
  session.ring.push(line);
  if (session.ring.length > OUTPUT_RING_SIZE) {
    session.ring.splice(0, session.ring.length - OUTPUT_RING_SIZE);
  }
  for (const cb of session.subscribers) {
    try { cb(line); } catch { /* subscriber gone */ }
  }
}

/**
 * Build the command array for a given provider.
 * On Windows we pass through cmd /c so that PATH-based commands work.
 */
function buildCommand(provider, model, task) {
  switch (provider) {
    case 'claude':
      // claude --model <model> -p "<task>" or just open interactive
      return task
        ? ['claude', '--model', model || 'claude-sonnet-4-6', '-p', task]
        : ['claude', '--model', model || 'claude-sonnet-4-6'];
    case 'gemini':
      return task
        ? ['gemini', '-p', task]
        : ['gemini'];
    case 'codex':
      return task
        ? ['codex', '-q', task]
        : ['codex'];
    case 'opencode':
      return task
        ? ['opencode', 'run', task]
        : ['opencode'];
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

/**
 * Create and start a new terminal session.
 *
 * @param {object} opts
 * @param {string} opts.provider
 * @param {string} [opts.model]
 * @param {string} [opts.task]  - initial prompt (optional)
 * @param {string} [opts.label]
 * @param {string} [opts.branch]
 * @param {string} [opts.cwd]
 * @returns {string} sessionId
 */
export function createSession({ provider, model = '', task = '', label = '', branch = '', cwd = process.cwd() }) {
  if (sessions.size >= MAX_SESSIONS) {
    // Evict the oldest done/error session first
    for (const [id, s] of sessions) {
      if (s.status === 'done' || s.status === 'error') {
        sessions.delete(id);
        break;
      }
    }
    if (sessions.size >= MAX_SESSIONS) {
      throw new Error(`Max sessions (${MAX_SESSIONS}) reached`);
    }
  }

  const id = newId();

  /** @type {Session} */
  const session = {
    id,
    provider,
    model,
    label: label || `${provider}${model ? ':' + model : ''}`,
    branch,
    status: 'starting',
    process: null,
    ring: [],
    subscribers: new Set(),
    idleTimer: null,
    startedAt: Date.now()
  };

  sessions.set(id, session);
  pushLine(session, 'system', `Session created: ${session.label}`);

  // Spawn asynchronously so createSession returns the id immediately
  setImmediate(() => spawnProcess(session, { task, cwd }));

  return id;
}

function spawnProcess(session, { task, cwd }) {
  try {
    const args = buildCommand(session.provider, session.model, task);
    pushLine(session, 'system', `Spawning: ${args.join(' ')}`);

    // On Windows, spawn via cmd /c to resolve PATH properly
    const isWin = process.platform === 'win32';
    // Remove CLAUDECODE env var so spawned Claude CLI doesn't think it's nested
    const env = { ...process.env };
    delete env.CLAUDECODE;
    const child = isWin
      ? spawn('cmd', ['/c', ...args], {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          env,
          windowsHide: true
        })
      : spawn(args[0], args.slice(1), {
          cwd,
          stdio: ['pipe', 'pipe', 'pipe'],
          env
        });

    session.process = child;
    session.status = 'running';

    let stdoutBuf = '';
    child.stdout.on('data', (chunk) => {
      stdoutBuf += chunk.toString('utf8');
      const lines = stdoutBuf.split('\n');
      stdoutBuf = lines.pop(); // keep incomplete line
      for (const line of lines) {
        if (line) pushLine(session, 'stdout', line);
      }
    });

    let stderrBuf = '';
    child.stderr.on('data', (chunk) => {
      stderrBuf += chunk.toString('utf8');
      const lines = stderrBuf.split('\n');
      stderrBuf = lines.pop();
      for (const line of lines) {
        if (line) pushLine(session, 'stderr', line);
      }
    });

    child.on('error', (err) => {
      session.status = 'error';
      pushLine(session, 'system', `Process error: ${err.message}`);
      session.process = null;
      resetIdleTimer(session);
    });

    child.on('close', (code, signal) => {
      // Flush remaining buffers
      if (stdoutBuf.trim()) pushLine(session, 'stdout', stdoutBuf);
      if (stderrBuf.trim()) pushLine(session, 'stderr', stderrBuf);

      session.status = code === 0 ? 'done' : 'error';
      pushLine(session, 'system', `Process exited: code=${code} signal=${signal}`);
      session.process = null;
      resetIdleTimer(session);
    });

  } catch (err) {
    session.status = 'error';
    pushLine(session, 'system', `Failed to spawn: ${err.message}`);
    session.process = null;
  }
}

/**
 * Send text to session stdin (simulates typing).
 * Automatically appends newline if missing.
 */
export function sendInput(sessionId, text) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);
  if (!session.process || session.status !== 'running') {
    throw new Error(`Session not running (status: ${session.status})`);
  }
  const payload = text.endsWith('\n') ? text : text + '\n';
  session.process.stdin.write(payload);
  pushLine(session, 'system', `> ${text.trim()}`);
}

/**
 * Kill a session (SIGTERM → SIGKILL after timeout).
 */
export function killSession(sessionId, reason = 'user request') {
  const session = sessions.get(sessionId);
  if (!session) return false;

  pushLine(session, 'system', `Killing session: ${reason}`);

  if (session.process) {
    const proc = session.process;
    session.process = null;
    session.status = 'done';

    const forceKill = setTimeout(() => {
      try { proc.kill('SIGKILL'); } catch { /* already dead */ }
    }, KILL_TIMEOUT_MS);

    proc.once('close', () => clearTimeout(forceKill));

    try {
      // On Windows, SIGTERM doesn't work — use taskkill
      if (process.platform === 'win32' && proc.pid) {
        spawn('taskkill', ['/F', '/T', '/PID', String(proc.pid)], { windowsHide: true });
      } else {
        proc.kill('SIGTERM');
      }
    } catch { /* process already gone */ }
  } else {
    session.status = 'done';
  }

  return true;
}

/**
 * Delete session record entirely (after it's done).
 */
export function deleteSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return false;
  if (session.process) killSession(sessionId, 'delete');
  sessions.delete(sessionId);
  return true;
}

/**
 * Get session metadata (without process handle).
 */
export function getSession(sessionId) {
  const session = sessions.get(sessionId);
  if (!session) return null;
  return {
    id: session.id,
    provider: session.provider,
    model: session.model,
    label: session.label,
    branch: session.branch,
    status: session.status,
    startedAt: session.startedAt,
    ringSize: session.ring.length
  };
}

/**
 * List all session metadata.
 */
export function listSessions() {
  return Array.from(sessions.values()).map((s) => getSession(s.id));
}

/**
 * Subscribe to live output from a session (SSE handler).
 * Returns unsubscribe function.
 * Replays buffered ring immediately to the callback.
 */
export function subscribeSession(sessionId, callback) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error(`Session not found: ${sessionId}`);

  // Replay ring buffer
  for (const line of session.ring) {
    try { callback(line); } catch { /* client gone */ }
  }

  session.subscribers.add(callback);
  // Cancel idle timer since we now have a subscriber
  if (session.idleTimer) {
    clearTimeout(session.idleTimer);
    session.idleTimer = null;
  }

  return () => {
    session.subscribers.delete(callback);
    resetIdleTimer(session);
  };
}
