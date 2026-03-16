#!/usr/bin/env node
/**
 * Agent Start — запускает CLI провайдера в ИНТЕРАКТИВНОМ режиме с задачей.
 *
 * 1. Читает задачу из файла CTX_TASK_FILE
 * 2. HTTP connect к chat server (phone-home)
 * 3. Запускает CLI с задачей (stdio: inherit — полный доступ к терминалу, нативный UI)
 * 4. Фоновый heartbeat
 *
 * Env vars:
 *   CTX_TASK_FILE  — путь к файлу с промптом задачи
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

// ==================== Read task ====================

let taskPrompt = '';
if (TASK_FILE) {
  try {
    taskPrompt = readFileSync(TASK_FILE, 'utf-8').trim();
  } catch (err) {
    console.error(`[agent-start] Cannot read task file: ${err.message}`);
    process.exit(1);
  }
}

if (!taskPrompt) {
  console.error('[agent-start] No task prompt (CTX_TASK_FILE empty or missing)');
  process.exit(1);
}

// ==================== Build command ====================
// shell: true + полная строка команды с кавычками вокруг промпта.
// Так промпт передаётся как ОДИН аргумент, независимо от пробелов.

const safePrompt = taskPrompt
  .replace(/[\r\n]+/g, ' ')   // убираем переносы строк
  .replace(/"/g, '')           // убираем кавычки (ломают cmd.exe)
  .replace(/[<>|&^]/g, '')    // убираем спецсимволы cmd.exe
  .trim();

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

// 3. Launch CLI — interactive mode, full terminal access
// shell: true + полная строка → кавычки вокруг промпта сохраняются
const child = spawn(fullCmd, [], {
  stdio: 'inherit',
  shell: true,
  cwd: process.cwd(),
  env: process.env,
});

child.on('error', (err) => {
  console.error(`[agent-start] Failed to spawn: ${err.message}`);
  process.exit(1);
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
