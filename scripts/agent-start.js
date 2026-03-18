#!/usr/bin/env node
/**
 * Agent Start — запускает CLI провайдера в брендированном режиме.
 *
 * Вместо нативного TUI провайдера показывает:
 *   ╔═══════════════════════════════════╗
 *   ║  ◈  Claude Code          ★ Lead  ║
 *   ╚═══════════════════════════════════╝
 *   ⠋ Работает...  (12s)
 *   ─────────────────────
 *   <реальный ответ провайдера>
 *   ─────────────────────
 *   ✓ Готово (45s)
 *
 * Flow:
 *   1. Показать брендированный хедер с логотипом провайдера
 *   2. Запустить CLI с pipe stdout/stderr (без TUI)
 *   3. Стриминг ответа: очищать ANSI, показывать реальный текст
 *   4. По завершении — отправить результат в chat server
 *
 * Env vars:
 *   CTX_TASK_FILE  — путь к файлу с промптом задачи (опционально)
 *   CTX_CHAT_URL   — chat server URL
 *   CTX_AGENT_ID   — provider id
 *   CTX_AGENT_NAME — human-readable name
 *   CTX_IS_LEAD    — "1" если team lead
 */

import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';

const CHAT_URL = process.env.CTX_CHAT_URL || '';
const AGENT_ID = process.env.CTX_AGENT_ID || 'unknown';
const AGENT_NAME = process.env.CTX_AGENT_NAME || AGENT_ID;
const TASK_FILE = process.env.CTX_TASK_FILE || '';
const IS_LEAD = process.env.CTX_IS_LEAD === '1';

// ==================== ANSI ====================

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

// ==================== Provider visuals ====================

const VISUALS = {
  claude:   { icon: '◈', color: '\x1b[95m', bar: '\x1b[35m', name: 'Claude Code' },
  gemini:   { icon: '◇', color: '\x1b[94m', bar: '\x1b[34m', name: 'Gemini CLI' },
  codex:    { icon: '▣', color: '\x1b[92m', bar: '\x1b[32m', name: 'Codex CLI' },
  opencode: { icon: '●', color: '\x1b[93m', bar: '\x1b[33m', name: 'OpenCode CLI' },
};

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

function getVisual() {
  return VISUALS[AGENT_ID] || { icon: '○', color: '\x1b[37m', bar: '\x1b[37m', name: AGENT_NAME };
}

// ==================== Branded header ====================

function showHeader(v) {
  const lead = IS_LEAD ? `  ${BOLD}★ Lead${RESET}` : '';
  const title = `  ${v.icon}  ${BOLD}${v.name}${RESET}${lead}  `;
  const titleLen = v.name.length + (IS_LEAD ? 12 : 4) + 4;
  const width = Math.max(titleLen + 4, 38);
  const line = '═'.repeat(width);
  const pad = ' '.repeat(Math.max(0, width - titleLen));

  console.log();
  console.log(`  ${v.color}╔${line}╗${RESET}`);
  console.log(`  ${v.color}║${RESET}${title}${pad}${v.color}║${RESET}`);
  console.log(`  ${v.color}╚${line}╝${RESET}`);
  console.log();
}

function showSeparator(v) {
  console.log(`  ${v.bar}${'─'.repeat(50)}${RESET}`);
}

function showStatus(v, text) {
  process.stdout.write(`\r  ${v.color}${text}${RESET}\x1b[K`);
}

function showDone(v, elapsed, code) {
  const icon = code === 0 ? `\x1b[92m✓${RESET}` : `\x1b[91m✗${RESET}`;
  const status = code === 0 ? 'Готово' : `Ошибка (code ${code})`;
  console.log(`\n`);
  showSeparator(v);
  console.log(`  ${icon} ${BOLD}${status}${RESET} ${DIM}(${elapsed}s)${RESET}`);
  console.log();
}

// ==================== ANSI stripping ====================

/**
 * Убирает все ANSI коды из текста.
 */
function stripAnsi(text) {
  return text
    .replace(/\x1b\[\?[0-9;]*[hlHLmM]/g, '')
    .replace(/\x1b\[[0-9;]*[A-Za-z]/g, '')
    .replace(/\x1b\[2?J/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\x1b\[=[0-9;]*[a-zA-Z]/g, '')
    .replace(/\r(?!\n)/g, '')
    .replace(/\x08/g, '');
}

/**
 * Извлечь реальный ответ из сырого stdout провайдера.
 * Убирает баннеры, дебаг-инфо, промпт-эхо — оставляет только ответ.
 */
function extractResponse(rawOutput) {
  const text = stripAnsi(rawOutput);

  switch (AGENT_ID) {
    case 'codex':
      return extractCodexResponse(text);
    case 'opencode':
      return extractOpenCodeResponse(text);
    case 'claude':
      return extractClaudeResponse(text);
    case 'gemini':
      return extractGeminiResponse(text);
    default:
      return cleanupGeneric(text);
  }
}

/**
 * Codex: извлекает только финальный ответ.
 * Логика: собрать текст из блоков "codex\n<текст>" (нарратив агента),
 * отбросить всё остальное (exec, tool calls, diffs, plan updates, etc).
 * Берём только ПОСЛЕДНИЙ нарративный блок как финальный ответ.
 */
function extractCodexResponse(text) {
  const lines = text.split('\n');

  // Паттерны для мусора
  const noise = /^(OpenAI Codex|--------|workdir:|model:|provider:|approval:|sandbox:|reasoning|session id:|^user$|mcp:|Reconnecting|warning:|Falling back|tokens?\s*used|\d+\s*$|exec$|codex$|tool\s+|codex\.\w+|^\s*\{|^\s*\}|^\s*"|\s*success in \d+|apply_patch|exited \d|Plan update|file update|diff --git|---\s*a\/|[+]{3}\s*b\/|@@\s|^[+-]\s|new file mode|index\s+[0-9a-f]|^A\s+C:|^[>✓→•]\s|участник мульти-агентной|ЗАДАЧА:|Выполни задачу|Работай в этом проекте|\s*$)/i;

  // Собираем "codex-нарратив" блоки — текст ПОСЛЕ строки "codex"
  const narrativeBlocks = [];
  let inNarrative = false;
  let currentBlock = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === 'codex') {
      // Начало нового нарративного блока
      if (currentBlock.length > 0) {
        narrativeBlocks.push(currentBlock.join('\n'));
      }
      currentBlock = [];
      inNarrative = true;
      continue;
    }

    if (inNarrative) {
      // Пустые строки — пропускаем, остаёмся в нарративе
      if (!trimmed) continue;
      if (noise.test(trimmed) && !trimmed.startsWith('Создан') && !trimmed.startsWith('Файл') && !trimmed.startsWith('Ограничение') && !trimmed.startsWith('Привет')) {
        // Конец нарратива — хит шум
        if (currentBlock.length > 0) {
          narrativeBlocks.push(currentBlock.join('\n'));
          currentBlock = [];
        }
        inNarrative = false;
      } else {
        currentBlock.push(trimmed);
      }
    }
  }
  if (currentBlock.length > 0) narrativeBlocks.push(currentBlock.join('\n'));

  // Берём последний непустой блок (финальный ответ)
  if (narrativeBlocks.length > 0) {
    // Если последний блок слишком короткий, объединяем последние 2
    const last = narrativeBlocks[narrativeBlocks.length - 1];
    if (last.length < 50 && narrativeBlocks.length > 1) {
      return (narrativeBlocks[narrativeBlocks.length - 2] + '\n\n' + last).trim();
    }
    return last.trim();
  }

  return cleanupGeneric(text);
}

/**
 * OpenCode: убирает build header, tokens counter.
 */
function extractOpenCodeResponse(text) {
  const lines = text.split('\n');
  const noise = /^(>\s*build|tokens?\s*used|^\d+\s*$|потому что локальный|shell оказался|\s*$)/i;
  const meaningful = lines.filter(l => !noise.test(l.trim()));
  return meaningful.join('\n').trim().replace(/\n{3,}/g, '\n\n');
}

/**
 * Claude: убирает прогресс-индикаторы, tool-use логи.
 * NB: для MCP-агентов этот ответ показывается только в сплите,
 * не постится в чат (Claude сам шлёт через ctx_chat_post).
 */
function extractClaudeResponse(text) {
  const lines = text.split('\n');
  const noise = /^(\s*[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]|Working|Thinking|Reading|Searching|Editing|Writing|Running|Bash|Glob|Grep|Read|Edit|Write|Agent|\s*✓\s*(Read|Wrote|Ran|Searched|Edited|Created)|.*\d+\.\d+s\s*$|>\s+|─{3,}|\s*$)/;
  const meaningful = lines.filter(l => !noise.test(l));
  return meaningful.join('\n').trim().replace(/\n{3,}/g, '\n\n');
}

/**
 * Gemini: убирает YOLO banner, extension loading, server updates, hook errors, Cooked footer.
 * NB: для MCP-агентов — только в сплите, не в чат.
 */
function extractGeminiResponse(text) {
  const lines = text.split('\n');
  const noise = /^(YOLO mode|Loaded cached|Loading extension|Server '|Discarding invalid|^\s*type:|^\s*command:|Cooked for|tokens?\s*used|Using model|Generating|Error executing tool|^\s*\}|^\s*$)/i;
  const meaningful = lines.filter(l => !noise.test(l.trim()));
  return meaningful.join('\n').trim().replace(/\n{3,}/g, '\n\n');
}

function cleanupGeneric(text) {
  return text.trim().replace(/^\s*$/gm, '').replace(/\n{3,}/g, '\n\n');
}

// ==================== Read task ====================

let taskPrompt = '';
if (TASK_FILE) {
  try {
    taskPrompt = readFileSync(TASK_FILE, 'utf-8').trim();
  } catch { /* idle mode */ }
}

const isIdle = !taskPrompt;

// ==================== Build CLI command ====================

function buildIdlePrompt() {
  if (IS_LEAD) {
    return [
      `Ты ${AGENT_NAME} (${AGENT_ID}) — TEAM LEAD мульти-агентной команды CTX.`,
      `Проект: ${safeCwd}`,
      `Ты в IDLE режиме — жди задачу от пользователя.`,
      `Проверяй чат через ctx_chat_history (type=delegation, target=${AGENT_ID}).`,
      `Когда получишь задачу:`,
      `1. Разбей на подзадачи и делегируй каждому участнику через ctx_chat_post (type=delegation, target=<id>).`,
      `2. Подожди 30-60 сек, проверь ответы через ctx_chat_history (type=report).`,
      `3. Синтезируй ответы и отправь финальный результат через ctx_chat_post (type=synthesis).`,
      `НЕ выполняй задачу сам — делегируй и синтезируй.`,
      `НЕ создавай файлы без явного запроса.`,
    ].join(' ');
  }
  return [
    `Ты ${AGENT_NAME} (${AGENT_ID}), участник мульти-агентной команды CTX.`,
    `Проект: ${safeCwd}`,
    `Ты в IDLE режиме — жди задачу от лида.`,
    `Проверяй чат через ctx_chat_history (type=delegation, target=${AGENT_ID}).`,
    `Когда получишь подзадачу от лида — выполни её.`,
    `ВАЖНО: отвечай текстом, НЕ создавай файлы без явного запроса.`,
    `После выполнения отправь результат через ctx_chat_post (type=report).`,
  ].join(' ');
}

function sanitize(text) {
  return text.replace(/[\r\n]+/g, ' ').replace(/"/g, '').replace(/[<>|&^]/g, '').trim();
}

const safePrompt = isIdle ? sanitize(buildIdlePrompt()) : sanitize(taskPrompt);

// needsTty: провайдер требует TTY (нельзя pipe stdout — зависнет)
// Для таких: stdio: 'inherit', показываем нативный вывод после branded header
const PROVIDER_DEFS = {
  claude:   { cmd: `claude "${safePrompt}" --dangerously-skip-permissions`, hasMcp: true,  needsTty: false },
  gemini:   { cmd: `gemini "${safePrompt}" --yolo`,                         hasMcp: true,  needsTty: false },
  codex:    { cmd: `codex exec --ephemeral --skip-git-repo-check "${safePrompt}"`, hasMcp: true,  needsTty: false },
  opencode: { cmd: `opencode run "${safePrompt}" -m zai-coding-plan/glm-5`, hasMcp: false, needsTty: false },
};

// ==================== Chat server ====================

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

async function postToChat(type, text) {
  if (!CHAT_URL) return;
  try {
    await fetch(`${CHAT_URL}/chat/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: AGENT_ID, agent: AGENT_NAME, type, text }),
      signal: AbortSignal.timeout(10000),
    });
  } catch { /* silent */ }
}

// ==================== ASCII cwd workaround ====================
// Codex CLI не работает с кириллицей в пути (WebSocket UTF-8 ошибка).
// Если есть junction C:\Projects\claude_ctx — используем его.

import { existsSync } from 'node:fs';

function getWorkingDir() {
  const cwd = process.cwd();
  // Если путь содержит non-ASCII и есть ASCII junction — используем его
  if (/[^\x00-\x7F]/.test(cwd)) {
    const junctionPath = 'C:\\Projects\\claude_ctx';
    if (existsSync(junctionPath)) {
      return junctionPath;
    }
  }
  return cwd;
}

const safeCwd = getWorkingDir();

// ==================== Run a single task ====================

/**
 * Запустить CLI с задачей, вернуть промис с результатом.
 */
function runTask(v, provDef, cmd) {
  return new Promise((resolve) => {
    showSeparator(v);
    console.log();

    const startTime = Date.now();
    let spinIdx = 0;
    const spinTimer = setInterval(() => {
      const elapsed = Math.round((Date.now() - startTime) / 1000);
      const frame = SPINNER[spinIdx % SPINNER.length];
      showStatus(v, `${frame} Работает...  ${DIM}(${elapsed}s)${RESET}`);
      spinIdx++;
    }, 120);

    if (provDef.needsTty) {
      // TTY mode (OpenCode)
      clearInterval(spinTimer);
      process.stdout.write('\r\x1b[K');

      const child = spawn(cmd, [], { stdio: 'inherit', shell: true, cwd: safeCwd, env: process.env });
      child.on('error', () => { resolve({ code: 1, response: '' }); });
      child.on('exit', (code) => {
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        showDone(v, elapsed, code || 0);
        resolve({ code: code || 0, response: '', elapsed });
      });
    } else {
      // Pipe mode (Claude, Gemini, Codex)
      const child = spawn(cmd, [], { stdio: ['ignore', 'pipe', 'pipe'], shell: true, cwd: safeCwd, env: process.env });
      let stdoutBuf = '', stderrBuf = '';
      child.stdout.on('data', (c) => { stdoutBuf += c.toString(); });
      child.stderr.on('data', (c) => { stderrBuf += c.toString(); });
      child.on('error', () => { clearInterval(spinTimer); resolve({ code: 1, response: '' }); });
      child.on('exit', (code) => {
        clearInterval(spinTimer);
        process.stdout.write('\r\x1b[K');
        const elapsed = Math.round((Date.now() - startTime) / 1000);
        const response = extractResponse(stdoutBuf + '\n' + stderrBuf);

        if (response) {
          for (const line of response.split('\n')) {
            console.log(`  ${line}`);
          }
        } else {
          console.log(`  ${DIM}(пустой ответ)${RESET}`);
        }

        showDone(v, elapsed, code || 0);
        resolve({ code: code || 0, response, elapsed });
      });
    }
  });
}

// ==================== Poll for new tasks ====================

async function pollForTasks() {
  if (!CHAT_URL) return null;
  try {
    const resp = await fetch(`${CHAT_URL}/chat/history?type=delegation&count=50`, {
      signal: AbortSignal.timeout(5000),
    });
    const data = await resp.json();
    return data.messages || [];
  } catch { return null; }
}

// ==================== Build CLI command for a given prompt ====================

function buildCmd(promptText) {
  const safe = sanitize(promptText);
  const cmds = {
    claude:   `claude "${safe}" --dangerously-skip-permissions`,
    gemini:   `gemini "${safe}" --yolo`,
    codex:    `codex exec --ephemeral --skip-git-repo-check "${safe}"`,
    opencode: `opencode run "${safe}" -m zai-coding-plan/glm-5`,
  };
  return cmds[AGENT_ID] || null;
}

// ==================== Main ====================

const providerDef = PROVIDER_DEFS[AGENT_ID];
if (!providerDef) {
  console.error(`[agent-start] Unknown provider: ${AGENT_ID}`);
  process.exit(1);
}

// Idle без MCP — exit silently (viewer handles display)
if (isIdle && !providerDef.hasMcp) {
  await postToChat('error', `${AGENT_NAME} не поддерживает MCP — idle-режим недоступен.`);
  process.exit(1);
}

// ==================== Background execution ====================
// agent-start работает в фоне (без визуального вывода).
// Viewer (agent-viewer.js) в сплит-панели показывает ответы через SSE.

connectToChat();
startHeartbeat();

const v = getVisual();

// Execute initial task
const { response, code, elapsed } = await runTask(v, providerDef, providerDef.cmd);

// Post result to chat (non-MCP only — MCP agents post via ctx_chat_post)
if (!providerDef.hasMcp) {
  if (response) {
    const maxLen = 5000;
    const text = response.length > maxLen
      ? response.slice(-maxLen) + `\n... (${response.length} chars total)`
      : response;
    await postToChat(code === 0 ? 'report' : 'error', text);
  } else {
    await postToChat(code === 0 ? 'done' : 'error', `${AGENT_NAME} ${code === 0 ? 'завершил' : 'ошибка'} (${elapsed}s)`);
  }
}

// ==================== Poll loop — ждём следующие задачи ====================

let lastTaskTs = Date.now();

const pollLoop = setInterval(async () => {
  const msgs = await pollForTasks();
  if (!msgs) return;

  const newTasks = msgs.filter(m => {
    if (m.ts <= lastTaskTs) return false;
    if (!m.target) return true;
    const t = m.target.toLowerCase();
    return t === AGENT_ID || t === 'все агенты' || t === 'all' || t === '*';
  });

  if (newTasks.length === 0) return;

  const task = newTasks[newTasks.length - 1];
  lastTaskTs = task.ts;

  // Build prompt for new task
  let prompt;
  if (IS_LEAD) {
    prompt = [
      `Ты ${AGENT_NAME} — TEAM LEAD команды CTX.`,
      `Проект: ${safeCwd}`,
      `ЗАДАЧА ОТ ПОЛЬЗОВАТЕЛЯ: ${task.text}`,
      `Делегируй подзадачи участникам через ctx_chat_post (type=delegation, target=<id>).`,
      `Потом проверь ответы через ctx_chat_history (type=report) и дай синтез через ctx_chat_post (type=synthesis).`,
      `НЕ выполняй задачу сам. НЕ создавай файлы без запроса.`,
    ].join('\n');
  } else {
    prompt = [
      `Ты ${AGENT_NAME}, участник команды CTX.`,
      `Проект: ${safeCwd}`,
      `ЗАДАЧА ОТ ЛИДА: ${task.text}`,
      `Выполни и дай краткий ответ. НЕ создавай файлы без запроса.`,
    ].join('\n');
  }
  const cmd = buildCmd(prompt);
  if (!cmd) return;

  const result = await runTask(v, providerDef, cmd);

  if (!providerDef.hasMcp && result.response) {
    const maxLen = 5000;
    const text = result.response.length > maxLen
      ? result.response.slice(-maxLen) + `\n...`
      : result.response;
    await postToChat(result.code === 0 ? 'report' : 'error', text);
  }
}, 10000);

pollLoop.unref();
process.on('SIGINT', () => { clearInterval(pollLoop); process.exit(0); });
process.on('SIGTERM', () => { clearInterval(pollLoop); process.exit(0); });
