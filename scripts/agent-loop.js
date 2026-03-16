#!/usr/bin/env node
/**
 * Agent Loop — SSE-driven task executor for CLI providers.
 *
 * Replaces idle CLI spawn. Instead of starting the CLI idle, this script:
 * 1. Connects to chat server (HTTP connect + SSE subscribe)
 * 2. Waits for delegation tasks targeted at this agent
 * 3. Runs CLI provider in non-interactive mode with task as prompt
 * 4. Captures output and posts result back to chat server
 * 5. Loops — waits for next task
 *
 * Env vars:
 *   CTX_CHAT_URL   — chat server URL (required)
 *   CTX_AGENT_ID   — provider id: claude, gemini, codex, opencode
 *   CTX_AGENT_NAME — human-readable name
 */

import http from 'node:http';
import { spawn } from 'node:child_process';

const CHAT_URL = process.env.CTX_CHAT_URL;
const AGENT_ID = process.env.CTX_AGENT_ID || 'unknown';
const AGENT_NAME = process.env.CTX_AGENT_NAME || AGENT_ID;
const CWD = process.cwd();

if (!CHAT_URL) {
  console.error('CTX_CHAT_URL not set');
  process.exit(1);
}

// ==================== ANSI ====================

const R = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';

// ==================== Provider CLI configs ====================

const PROVIDER_CMDS = {
  claude: {
    cmd: 'claude',
    buildArgs: (prompt) => ['-p', prompt, '--dangerously-skip-permissions'],
  },
  gemini: {
    cmd: 'gemini',
    buildArgs: (prompt) => ['-p', prompt, '--yolo'],
  },
  codex: {
    cmd: 'codex',
    buildArgs: (prompt) => [prompt, '--full-auto', '-q'],
  },
  opencode: {
    cmd: 'opencode',
    buildArgs: (prompt) => [prompt],
  },
};

// ==================== Logging ====================

function log(msg) {
  const time = new Date().toLocaleTimeString('ru-RU', { hour12: false });
  console.log(`  ${DIM}${time}${R} ${msg}`);
}

function banner() {
  console.log(`
${CYAN}${BOLD}  ╔════════════════════════════════════════════╗
  ║  CTX Agent Loop — ${AGENT_NAME.padEnd(24)}║
  ╚════════════════════════════════════════════╝${R}
`);
  log(`Agent:  ${BOLD}${AGENT_NAME}${R} (${AGENT_ID})`);
  log(`Server: ${CHAT_URL}`);
  log(`CWD:    ${CWD}`);
  log(`Mode:   SSE → auto-execute → post result`);
  console.log(`  ${DIM}${'─'.repeat(50)}${R}`);
}

// ==================== HTTP helpers ====================

async function postToChat(data) {
  try {
    const resp = await fetch(`${CHAT_URL}/chat/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(10000),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

async function connectAgent() {
  for (let i = 0; i < 15; i++) {
    try {
      const resp = await fetch(`${CHAT_URL}/chat/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: AGENT_ID, provider: AGENT_ID, name: AGENT_NAME }),
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) return true;
    } catch { /* retry */ }
    await sleep(2000);
  }
  return false;
}

async function heartbeat() {
  try {
    await fetch(`${CHAT_URL}/chat/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agentId: AGENT_ID, status: busy ? 'busy' : 'idle' }),
      signal: AbortSignal.timeout(3000),
    });
  } catch { /* silent */ }
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ==================== CLI runner ====================

async function runProvider(taskText) {
  const config = PROVIDER_CMDS[AGENT_ID];
  if (!config) {
    log(`${RED}Unknown provider: ${AGENT_ID}${R}`);
    return `Error: unknown provider "${AGENT_ID}"`;
  }

  // Enhanced prompt with team context
  const prompt = [
    `Ты ${AGENT_NAME}, участник мульти-агентной команды CTX.`,
    `Проект: ${CWD}`,
    ``,
    `ЗАДАЧА: ${taskText}`,
    ``,
    `Выполни задачу и дай конкретный результат.`,
  ].join('\n');

  const args = config.buildArgs(prompt);
  const cmdPreview = `${config.cmd} ${args.map(a => a.length > 60 ? a.slice(0, 60) + '...' : a).join(' ')}`;
  log(`${CYAN}▸ ${cmdPreview}${R}`);

  return new Promise((resolve) => {
    let output = '';
    let timedOut = false;

    const isWin = process.platform === 'win32';
    const child = spawn(config.cmd, args, {
      cwd: CWD,
      shell: isWin, // .cmd shims on Windows need shell
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      // Show stderr but don't include in result unless it's meaningful
      if (!text.includes('ExperimentalWarning')) {
        process.stderr.write(`${DIM}${text}${R}`);
      }
    });

    // 5 min timeout
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => child.kill('SIGKILL'), 5000);
    }, 300000);

    child.on('close', (code) => {
      clearTimeout(timer);
      if (timedOut) {
        log(`${YELLOW}Timeout (5 min)${R}`);
        resolve(output.trim() + '\n\n[TIMEOUT: задача превысила 5 минут]');
      } else {
        log(`${code === 0 ? GREEN : YELLOW}Exit: ${code}${R}`);
        resolve(output.trim());
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      log(`${RED}Error: ${err.message}${R}`);
      resolve(`Error spawning ${config.cmd}: ${err.message}`);
    });
  });
}

// ==================== SSE listener ====================

const processedIds = new Set();
let busy = false;

function connectSSE() {
  const url = new URL('/chat/stream', CHAT_URL);

  const req = http.get(url, (res) => {
    let buffer = '';
    log(`${GREEN}SSE connected — listening for tasks${R}`);

    res.on('data', (chunk) => {
      buffer += chunk.toString();
      const parts = buffer.split('\n\n');
      buffer = parts.pop();

      for (const part of parts) {
        if (!part.trim() || part.startsWith(':')) continue;

        const lines = part.split('\n');
        let data = '';
        for (const line of lines) {
          if (line.startsWith('data: ')) data = line.substring(6);
        }

        if (data) {
          try {
            const msg = JSON.parse(data);
            handleMessage(msg);
          } catch { /* ignore */ }
        }
      }
    });

    res.on('error', () => {
      log(`${YELLOW}SSE disconnected, reconnecting...${R}`);
      setTimeout(connectSSE, 3000);
    });
    res.on('end', () => {
      log(`${YELLOW}SSE stream ended, reconnecting...${R}`);
      setTimeout(connectSSE, 3000);
    });
  });

  req.on('error', () => {
    setTimeout(connectSSE, 3000);
  });
}

async function handleMessage(msg) {
  // Only react to delegation messages
  if (msg.type !== 'delegation') return;

  // Deduplicate
  const msgKey = msg.id ?? msg.ts;
  if (msgKey !== undefined && processedIds.has(msgKey)) return;
  if (msgKey !== undefined) processedIds.add(msgKey);

  // Check target — is this for us?
  const target = (msg.target || '').toLowerCase();
  const forUs = !target
    || target === 'все агенты'
    || target === 'all'
    || target === AGENT_ID
    || target === AGENT_NAME.toLowerCase();

  if (!forUs) return;

  // Skip our own messages
  if (msg.agent === AGENT_NAME || msg.agent === AGENT_ID) return;

  if (busy) {
    log(`${YELLOW}⏳ Busy — skipping: ${msg.text?.slice(0, 60)}${R}`);
    await postToChat({
      role: AGENT_ID, agent: AGENT_NAME, type: 'progress',
      text: 'Занят предыдущей задачей, поставлю в очередь',
    });
    return;
  }

  busy = true;
  console.log();
  log(`${GREEN}${BOLD}📋 Задача получена:${R} ${msg.text}`);
  console.log(`  ${DIM}${'─'.repeat(50)}${R}`);

  // Announce start
  await postToChat({
    role: AGENT_ID, agent: AGENT_NAME, type: 'progress',
    text: `Начинаю: ${msg.text?.slice(0, 150)}`,
  });

  // Run CLI
  const startTime = Date.now();
  const result = await runProvider(msg.text);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`  ${DIM}${'─'.repeat(50)}${R}`);
  log(`${GREEN}✓ Готово за ${elapsed}s${R}`);

  // Post result (truncate if too long)
  const maxLen = 8000;
  const resultText = result.length > maxLen
    ? result.slice(0, maxLen) + `\n\n...(обрезано, полный вывод ${result.length} символов)`
    : result;

  await postToChat({
    role: AGENT_ID, agent: AGENT_NAME, type: 'result',
    text: resultText || '(пустой вывод)',
  });

  busy = false;
  log(`${DIM}Ожидаю следующую задачу...${R}`);
}

// Check for tasks that were posted before we connected
async function checkPendingTasks() {
  try {
    const resp = await fetch(`${CHAT_URL}/chat/history?count=50`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await resp.json();
    for (const msg of data.messages) {
      await handleMessage(msg);
    }
  } catch { /* silent */ }
}

// ==================== Main ====================

banner();

// 1. Connect to chat server
const ok = await connectAgent();
if (!ok) {
  log(`${RED}Failed to connect to chat server after 30s${R}`);
  process.exit(1);
}
log(`${GREEN}✓ Connected to chat server${R}`);

// 2. Start heartbeat
const hbInterval = setInterval(heartbeat, 25000);
hbInterval.unref();

// 3. Subscribe to SSE for real-time tasks
connectSSE();

// 4. Check for pending tasks (posted before we connected)
setTimeout(checkPendingTasks, 2000);

// 5. Handle shutdown
process.on('SIGINT', () => {
  log(`${DIM}Shutting down...${R}`);
  clearInterval(hbInterval);
  process.exit(0);
});
process.on('SIGTERM', () => {
  clearInterval(hbInterval);
  process.exit(0);
});
