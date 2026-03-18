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
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

import { existsSync, appendFileSync, mkdirSync } from 'node:fs';

const CHAT_URL = process.env.CTX_CHAT_URL;
const AGENT_ID = process.env.CTX_AGENT_ID || 'unknown';
const AGENT_NAME = process.env.CTX_AGENT_NAME || AGENT_ID;
const IS_LEAD = process.env.CTX_IS_LEAD === '1';

// ASCII cwd workaround для Codex (кириллица в пути ломает WebSocket)
// subst P: → виртуальный диск без кириллицы (junction не помогает — Codex резолвит)
function getWorkingDir() {
  const cwd = process.cwd();
  if (/[^\x00-\x7F]/.test(cwd)) {
    // Проверяем subst P:
    if (existsSync('P:\\package.json')) return 'P:\\';
    // Fallback: junction
    const junction = 'C:\\Projects\\claude_ctx';
    if (existsSync(junction)) return junction;
  }
  return cwd;
}
const CWD = getWorkingDir();

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

/**
 * Sanitize prompt for shell — убираем символы, ломающие cmd.exe.
 * Промпт оборачивается в кавычки в buildCmd, здесь только чистим.
 */
function sanitizePrompt(text) {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/"/g, '')
    .replace(/[<>|&^%!]/g, '')
    .trim();
}

/**
 * Провайдеры — buildCmd возвращает ПОЛНУЮ строку команды (не массив).
 * Используем spawn(cmd, [], {shell: true}) чтобы cmd.exe правильно обработал кавычки.
 */
const PROVIDER_CMDS = {
  claude: {
    buildCmd: (prompt) => `claude -p "${sanitizePrompt(prompt)}" --dangerously-skip-permissions`,
  },
  gemini: {
    buildCmd: (prompt) => `gemini "${sanitizePrompt(prompt)}" --yolo`,
  },
  codex: {
    buildCmd: (prompt) => `codex exec --ephemeral --skip-git-repo-check "${sanitizePrompt(prompt)}"`,
  },
  opencode: {
    buildCmd: (prompt) => `opencode run "${sanitizePrompt(prompt)}" -m zai-coding-plan/glm-5`,
  },
};

// ==================== Output cleanup ====================

/**
 * Убирает ANSI и per-provider мусор из вывода CLI.
 */
function cleanOutput(raw) {
  // Strip ANSI
  let text = raw
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\x1b\[\?[0-9;]*[hlHLmM]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\r(?!\n)/g, '')
    .replace(/\x08/g, '');

  const lines = text.split('\n');
  const noise = [
    // Codex
    /^OpenAI Codex/i, /^-{4,}/, /^workdir:/i, /^model:/i, /^provider:/i,
    /^approval:/i, /^sandbox:/i, /^reasoning/i, /^session id:/i,
    /^mcp:/, /^mcp startup/, /^\d{4}-\d{2}-\d{2}T.*ERROR/,
    /^Reconnecting/, /^warning:/i, /^Falling back/,
    /^tokens?\s*used/i, /^\d[\d\s]*$/,
    /^exec$/, /^codex$/, /^user$/,
    /^tool\s+/, /codex\.\w+.*success/, /^\s*\{/, /^\s*\}/, /^\s*"/,
    /^apply_patch/, /^exited \d/, /^Plan update/, /^file update/,
    /^diff --git/, /^---\s*a\//, /^\+{3}\s*b\//, /^@@\s/, /^[+-]\s/,
    /^new file mode/, /^index\s+[0-9a-f]/,
    // Gemini
    /^YOLO mode/i, /^Loaded cached/i, /^Loading extension/i,
    /^Server '/, /^Discarding invalid/, /^Cooked for/i,
    /^\[MCP error\]/, /^MCP issues detected/, /^Run \/mcp/,
    /^Error during dis/, /^type:.*command/, /^command:/,
    /^at\s+(McpError|Timeout|listOnTimeout|process\.)/, /^at\s+\S+\s+\(file:\/\/\//,
    /^at\s+\S+\s+\(node:internal/,
    /file:\/\/\/C:\/Users\//,
    // Codex sandbox
    /^execution error/, /^windows sandbox/, /CreateProcessWithLogonW/,
    /^startup_timeout/, /^\[mcp_servers/,
    /setup refresh failed/,
    // Claude
    /^\s*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/, /^Working|^Thinking|^Reading|^Searching/,
    /^\s*✓\s*(Read|Wrote|Ran|Searched|Edited|Created)/,
    // General
    /^ExperimentalWarning/, /^DeprecationWarning/,
    // Prompt echo
    /участник.*команды CTX/, /TEAM LEAD/, /ЗАДАЧА:/, /НЕ создавай файлы/,
    /Дай краткий ответ/, /Отвечай текстом/, /Выполни задачу/,
  ];

  const clean = lines.filter(l => {
    const t = l.trim();
    if (!t) return false;
    return !noise.some(re => re.test(t));
  });

  return clean.join('\n').trim().replace(/\n{3,}/g, '\n\n');
}

// ==================== Logging ====================

const LOG_DIR = join(__dirname, '..', 'logs');
try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}
const LOG_FILE = join(LOG_DIR, `agent-${AGENT_ID}.log`);

function log(msg) {
  const time = new Date().toLocaleTimeString('ru-RU', { hour12: false });
  const clean = msg.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
  console.log(`  ${DIM}${time}${R} ${msg}`);
  appendFileSync(LOG_FILE, `${time} ${clean}\n`);
}

function logRaw(label, text) {
  const time = new Date().toLocaleTimeString('ru-RU', { hour12: false });
  appendFileSync(LOG_FILE, `${time} [${label}] ${text?.slice(0, 500) || '(empty)'}\n`);
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

  // Prompt with team context and role
  const prompt = IS_LEAD
    ? [
        `Ты ${AGENT_NAME} — TEAM LEAD команды CTX.`,
        `Проект: ${CWD}`,
        `ЗАДАЧА ОТ ПОЛЬЗОВАТЕЛЯ: ${taskText}`,
        `ВАЖНО: НЕ создавай файлы без явного запроса. Отвечай текстом.`,
      ].join('\n')
    : [
        `Ты ${AGENT_NAME}, участник команды CTX.`,
        `Проект: ${CWD}`,
        `ЗАДАЧА: ${taskText}`,
        `ВАЖНО: НЕ создавай файлы без явного запроса. Дай краткий ответ.`,
      ].join('\n');

  const fullCmd = config.buildCmd(prompt);
  logRaw('RUN_CMD', fullCmd.slice(0, 300));
  logRaw('PROMPT_LEN', `${prompt.length} chars, cmd_len=${fullCmd.length}`);
  log(`${CYAN}▸ ${fullCmd.slice(0, 120)}${fullCmd.length > 120 ? '...' : ''}${R}`);

  // Длинные промпты (>6000 chars) — пишем в temp file, передаём через stdin
  // Windows cmd.exe ограничивает строку до 8191 символов
  let useStdin = false;
  let actualCmd = fullCmd;
  let tmpFile = null;

  if (fullCmd.length > 6000) {
    const { writeFileSync, unlinkSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    tmpFile = join(tmpdir(), `ctx-prompt-${AGENT_ID}-${Date.now()}.txt`);
    writeFileSync(tmpFile, prompt, 'utf-8');
    logRaw('LONG_PROMPT', `written to ${tmpFile} (${prompt.length} chars)`);

    // Заменяем команду на чтение из файла
    if (AGENT_ID === 'claude') {
      actualCmd = `claude -p - --dangerously-skip-permissions < "${tmpFile}"`;
    } else if (AGENT_ID === 'gemini') {
      actualCmd = `gemini - --yolo < "${tmpFile}"`;
    } else {
      // Codex/OpenCode — пишем укороченную версию
      const short = sanitizePrompt(prompt.slice(0, 4000));
      actualCmd = config.buildCmd(short);
      logRaw('TRUNCATED', `prompt cut to 4000 chars for ${AGENT_ID}`);
    }
  }

  return new Promise((resolve) => {
    let output = '';
    let timedOut = false;

    const child = spawn(actualCmd, [], {
      cwd: CWD,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });

    child.stdout.on('data', (data) => {
      const text = data.toString();
      output += text;
      process.stdout.write(text);
      logRaw('stdout', text.trim());
    });

    child.stderr.on('data', (data) => {
      const text = data.toString();
      if (!text.includes('ExperimentalWarning') && !text.includes('DeprecationWarning')) {
        output += text;
        process.stderr.write(`${DIM}${text}${R}`);
        logRaw('stderr', text.trim());
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
      // Cleanup temp file
      if (tmpFile) { try { const { unlinkSync } = require('node:fs'); unlinkSync(tmpFile); } catch {} }
      logRaw('RAW_OUTPUT', output.slice(0, 1000));
      const cleaned = cleanOutput(output);
      logRaw('CLEAN_OUTPUT', cleaned.slice(0, 500));
      logRaw('EXIT', `code=${code} raw_len=${output.length} clean_len=${cleaned.length}`);
      if (timedOut) {
        log(`${YELLOW}Timeout (5 min)${R}`);
        resolve(cleaned + '\n\n[TIMEOUT]');
      } else {
        log(`${code === 0 ? GREEN : YELLOW}Exit: ${code}${R}`);
        resolve(cleaned);
      }
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      logRaw('SPAWN_ERROR', err.message);
      log(`${RED}Error: ${err.message}${R}`);
      resolve(`Error spawning ${AGENT_ID}: ${err.message}`);
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
    || target === '*'
    || target === AGENT_ID
    || target === AGENT_NAME.toLowerCase();

  if (!forUs) {
    logRaw('SSE_SKIP', `not for us: target=${target} agent=${msg.agent} type=${msg.type}`);
    return;
  }

  // Skip our own delegation messages (lead delegating to others)
  if (msg.agent === AGENT_NAME || (msg.role || '').toLowerCase() === AGENT_ID) {
    logRaw('SSE_SKIP', `own message: agent=${msg.agent} type=${msg.type}`);
    return;
  }

  if (busy) {
    log(`${YELLOW}⏳ Busy — skipping: ${msg.text?.slice(0, 60)}${R}`);
    return;
  }

  busy = true;
  console.log();
  logRaw('TASK_RECEIVED', `from=${msg.agent} target=${msg.target} text=${msg.text}`);
  log(`${GREEN}${BOLD}📋 Задача получена:${R} ${msg.text}`);
  console.log(`  ${DIM}${'─'.repeat(50)}${R}`);

  if (IS_LEAD) {
    // ==================== LEAD: делегировать + собрать + синтезировать ====================
    await handleLeadTask(msg.text);
  } else {
    // ==================== MEMBER: выполнить и ответить ====================
    await handleMemberTask(msg.text);
  }

  busy = false;
  log(`${DIM}Ожидаю следующую задачу...${R}`);
}

// ==================== Member: просто выполнить ====================

async function handleMemberTask(taskText) {
  await postToChat({
    role: AGENT_ID, agent: AGENT_NAME, type: 'progress',
    text: `Начинаю: ${taskText?.slice(0, 150)}`,
  });

  const startTime = Date.now();
  const result = await runProvider(taskText);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  console.log(`  ${DIM}${'─'.repeat(50)}${R}`);
  log(`${GREEN}✓ Готово за ${elapsed}s${R}`);

  const maxLen = 8000;
  const resultText = result.length > maxLen
    ? result.slice(0, maxLen) + `\n\n...(обрезано)`
    : result;

  await postToChat({
    role: AGENT_ID, agent: AGENT_NAME, type: 'report',
    text: resultText || '(пустой вывод)',
  });
}

// ==================== Lead: консилиум ====================
// Принцип: ВСЕ работают параллельно (включая лида), потом лид синтезирует.
// Лид НЕ только делегирует — он тоже выполняет задачу как эксперт.

async function handleLeadTask(taskText) {
  log(`${MAGENTA}★ Консилиум: все работают параллельно${R}`);

  // 1. Отправляем задачу команде
  await postToChat({
    role: AGENT_ID, agent: AGENT_NAME, type: 'delegation',
    text: taskText,
    target: 'все агенты',
  });
  log(`${CYAN}→ Задача отправлена команде${R}`);

  // 2. Лид тоже выполняет задачу (параллельно с командой)
  log(`${CYAN}→ Выполняю задачу...${R}`);
  const startTime = Date.now();
  const myResult = await runProvider(taskText);
  const myElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  log(`${GREEN}✓ Мой ответ готов (${myElapsed}s)${R}`);
  logRaw('LEAD_RESULT', myResult?.slice(0, 500));

  // Постим свой ответ как report (виден в viewer)
  await postToChat({
    role: AGENT_ID, agent: AGENT_NAME, type: 'report',
    text: myResult?.slice(0, 5000) || '(пусто)',
  });

  // 3. Собираем ответы команды (poll каждые 10с, макс 4 мин)
  log(`${CYAN}⏳ Собираю ответы команды...${R}`);
  const teamReports = [];
  const deadline = Date.now() + 240000;
  const delegationTs = startTime - 5000;

  while (Date.now() < deadline) {
    await sleep(10000);
    try {
      const resp = await fetch(`${CHAT_URL}/chat/history?type=report&count=50`, {
        signal: AbortSignal.timeout(5000),
      });
      const data = await resp.json();
      const newReports = (data.messages || []).filter(m =>
        m.ts > delegationTs &&
        (m.role || '').toLowerCase() !== AGENT_ID &&
        !teamReports.find(r => r.id === m.id)
      );

      for (const r of newReports) {
        teamReports.push(r);
        log(`${GREEN}← ${r.agent}: ответ получен (${(r.text || '').length} chars)${R}`);
        logRaw('TEAM_REPORT', `from=${r.agent} len=${(r.text||'').length}`);
      }

      // Есть ответы и прошло достаточно времени — синтезируем
      if (teamReports.length > 0 && Date.now() - startTime > 60000) break;
    } catch (err) {
      logRaw('POLL_ERROR', err.message);
    }
  }

  // 4. Синтез — что сказал каждый + финальное решение
  log(`${MAGENTA}★ Синтезирую (${teamReports.length} ответов команды + мой)...${R}`);

  const parts = [`Мой ответ (${AGENT_NAME}):\n${myResult?.slice(0, 3000) || '(пусто)'}`];
  for (const r of teamReports) {
    parts.push(`${r.agent}:\n${(r.text || '').slice(0, 3000)}`);
  }

  const synthesisPrompt = [
    `Ты лид команды. Задача: ${taskText}`,
    `Ответы участников:`,
    parts.join('\n---\n'),
    `Дай краткий синтез: ключевые находки каждого участника и твоё финальное решение. НЕ создавай файлы.`,
  ].join('\n');

  const synthesis = await runProvider(synthesisPrompt);
  logRaw('SYNTHESIS', synthesis?.slice(0, 500));

  await postToChat({
    role: AGENT_ID, agent: AGENT_NAME, type: 'synthesis',
    text: (synthesis || '(пустой синтез)').slice(0, 8000),
  });

  log(`${GREEN}${BOLD}★ Синтез опубликован${R}`);
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
logRaw('STARTUP', `agent=${AGENT_ID} name=${AGENT_NAME} lead=${IS_LEAD} cwd=${CWD} chat=${CHAT_URL}`);

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
