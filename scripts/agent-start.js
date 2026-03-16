#!/usr/bin/env node
/**
 * Agent Start — запускает CLI провайдера в интерактивном режиме.
 *
 * Два режима:
 *   A) С задачей: CTX_TASK_FILE → CLI получает промпт при запуске
 *   B) Idle: без задачи → CLI стартует в интерактивном режиме,
 *      агент получает задачи через MCP чат (ctx_chat_history)
 *
 * Flow:
 *   1. (Опционально) читает задачу из CTX_TASK_FILE
 *   2. HTTP connect к chat server (phone-home)
 *   3. Запускает CLI (stdio: inherit — полный доступ к терминалу)
 *   4. Фоновый heartbeat
 *
 * Env vars:
 *   CTX_TASK_FILE  — путь к файлу с промптом задачи (опционально)
 *   CTX_CHAT_URL   — chat server URL
 *   CTX_AGENT_ID   — provider id
 *   CTX_AGENT_NAME — human-readable name
 */

import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const CHAT_URL = process.env.CTX_CHAT_URL || '';
const AGENT_ID = process.env.CTX_AGENT_ID || 'unknown';
const AGENT_NAME = process.env.CTX_AGENT_NAME || AGENT_ID;
const TASK_FILE = process.env.CTX_TASK_FILE || '';

// ==================== Read task (optional) ====================

let taskPrompt = '';
if (TASK_FILE) {
  try {
    taskPrompt = readFileSync(TASK_FILE, 'utf-8').trim();
  } catch {
    // Task file missing is OK in idle mode
  }
}

const isIdle = !taskPrompt;

// ==================== Build command ====================

function buildIdlePrompt() {
  return [
    `Ты ${AGENT_NAME} (${AGENT_ID}), участник мульти-агентной команды CTX.`,
    `Проект: ${process.cwd()}`,
    ``,
    `Ты запущен в IDLE режиме — жди задачу.`,
    `Проверяй чат через MCP-инструмент ctx_chat_history (type=delegation).`,
    `Когда увидишь задачу для тебя (target=${AGENT_ID} или target=все агенты) — выполни её.`,
    `После выполнения отправь результат через ctx_chat_post (type=done).`,
    `Между проверками жди 10 секунд.`,
  ].join(' ');
}

function sanitizeForShell(text) {
  return text
    .replace(/[\r\n]+/g, ' ')
    .replace(/"/g, '')
    .replace(/[<>|&^]/g, '')
    .trim();
}

const safePrompt = isIdle
  ? sanitizeForShell(buildIdlePrompt())
  : sanitizeForShell(taskPrompt);

const PROVIDER_CMDS = {
  claude:   `claude "${safePrompt}" --dangerously-skip-permissions`,
  gemini:   `gemini -i "${safePrompt}" --yolo`,
  codex:    `codex "${safePrompt}" --full-auto`,
  opencode: `opencode --prompt "${safePrompt}"`,
};

// ==================== Phone home ====================

async function connectToChat() {
  if (!CHAT_URL) return;
  for (let i = 0; i < 10; i++) {
    try {
      const resp = await fetch(`${CHAT_URL}/chat/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: AGENT_ID, provider: AGENT_ID, name: AGENT_NAME }),
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) return;
    } catch { /* retry */ }
    await new Promise(r => setTimeout(r, 1500));
  }
}

function startHeartbeat() {
  if (!CHAT_URL) return;
  const interval = setInterval(async () => {
    try {
      await fetch(`${CHAT_URL}/chat/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId: AGENT_ID, status: 'active' }),
        signal: AbortSignal.timeout(3000),
      });
    } catch { /* silent */ }
  }, 25000);
  interval.unref();
}

// ==================== Main ====================

// 1. Connect to chat server (non-blocking)
connectToChat();
startHeartbeat();

// 2. Build command string
const fullCmd = PROVIDER_CMDS[AGENT_ID];
if (!fullCmd) {
  console.error(`[agent-start] Unknown provider: ${AGENT_ID}`);
  process.exit(1);
}

// Debug: показываем что запускаем
console.log(`[ctx] Agent: ${AGENT_NAME} (${AGENT_ID})`);
console.log(`[ctx] Mode: ${isIdle ? 'IDLE (waiting for tasks via chat)' : 'TASK'}`);
console.log(`[ctx] Chat: ${CHAT_URL || 'none'}`);
console.log(`[ctx] Command: ${fullCmd.slice(0, 120)}${fullCmd.length > 120 ? '...' : ''}`);
console.log(`[ctx] Starting...\n`);

// 3. Launch CLI — interactive mode, full terminal access
const child = spawn(fullCmd, [], {
  stdio: 'inherit',
  shell: true,
  cwd: process.cwd(),
  env: process.env,
});

child.on('error', (err) => {
  console.error(`\n[agent-start] FAILED to spawn: ${err.message}`);
  console.error(`[agent-start] Command was: ${fullCmd.slice(0, 200)}`);
  console.error(`[agent-start] Press any key to close...`);
  process.stdin.resume();
});

child.on('exit', (code) => {
  if (code !== 0) {
    console.error(`\n[agent-start] CLI exited with code ${code}`);
    console.error(`[agent-start] Command was: ${fullCmd.slice(0, 200)}`);
    console.error(`[agent-start] Press any key to close...`);
    process.stdin.resume();
  } else {
    process.exit(0);
  }
});
