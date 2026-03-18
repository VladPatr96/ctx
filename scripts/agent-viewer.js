#!/usr/bin/env node
/**
 * Agent Viewer — легковесный SSE-клиент для сплит-панели.
 *
 * Показывает брендированный хедер + стрим ответов агента из chat server.
 * Агент работает в фоновом процессе — viewer только отображает.
 *
 * Env vars:
 *   CTX_CHAT_URL   — chat server URL
 *   CTX_AGENT_ID   — provider id (для фильтрации сообщений)
 *   CTX_AGENT_NAME — human-readable name
 *   CTX_IS_LEAD    — "1" если team lead
 */

import http from 'node:http';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

const CHAT_URL = process.env.CTX_CHAT_URL || '';
const AGENT_ID = process.env.CTX_AGENT_ID || 'unknown';
const AGENT_NAME = process.env.CTX_AGENT_NAME || AGENT_ID;
const IS_LEAD = process.env.CTX_IS_LEAD === '1';

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

const VISUALS = {
  claude:   { icon: '◈', color: '\x1b[95m', bar: '\x1b[35m' },
  gemini:   { icon: '◇', color: '\x1b[94m', bar: '\x1b[34m' },
  codex:    { icon: '▣', color: '\x1b[92m', bar: '\x1b[32m' },
  opencode: { icon: '●', color: '\x1b[93m', bar: '\x1b[33m' },
};

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

const TYPE_STYLE = {
  delegation: { label: 'ЗАДАЧА', color: '\x1b[33m' },
  report:     { label: 'ОТВЕТ', color: '\x1b[92m' },
  synthesis:  { label: 'СИНТЕЗ', color: '\x1b[95m' },
  done:       { label: 'ГОТОВО', color: '\x1b[92m' },
  error:      { label: 'ОШИБКА', color: '\x1b[91m' },
  opinion:    { label: 'мнение', color: '\x1b[36m' },
  progress:   { label: '...', color: '\x1b[2m' },
  system:     { label: 'система', color: '\x1b[2m' },
};

const v = VISUALS[AGENT_ID] || { icon: '○', color: '\x1b[37m', bar: '\x1b[37m' };

// ==================== Branded header ====================

function showHeader() {
  const lead = IS_LEAD ? `  ${BOLD}★ Lead${RESET}` : '';
  const title = `  ${v.icon}  ${BOLD}${AGENT_NAME}${RESET}${lead}  `;
  const titleLen = AGENT_NAME.length + (IS_LEAD ? 12 : 4) + 4;
  const width = Math.max(titleLen + 4, 38);
  const line = '═'.repeat(width);

  console.log();
  console.log(`  ${v.color}╔${line}╗${RESET}`);
  console.log(`  ${v.color}║${RESET}${title}${' '.repeat(Math.max(0, width - titleLen))}${v.color}║${RESET}`);
  console.log(`  ${v.color}╚${line}╝${RESET}`);
  console.log();
}

function showSeparator() {
  console.log(`  ${v.bar}${'─'.repeat(50)}${RESET}`);
}

// ==================== Message rendering ====================

function renderMessage(msg) {
  const ts = TYPE_STYLE[msg.type] || { label: msg.type, color: DIM };
  const time = new Date(msg.ts || Date.now()).toLocaleTimeString('ru-RU', { hour12: false });

  if (msg.type === 'synthesis') {
    // Double-border box for synthesis
    const width = Math.min(process.stdout.columns || 80, 76);
    const dline = '═'.repeat(width);
    console.log();
    console.log(`  ${v.color}╔─ ★ ${BOLD}СИНТЕЗ${RESET} ${v.color}${dline.slice(10)}╗${RESET}`);
    console.log(`  ${v.color}║${RESET}`);
    for (const line of (msg.text || '').split('\n')) {
      console.log(`  ${v.color}║${RESET}  ${line}`);
    }
    console.log(`  ${v.color}║${RESET}`);
    console.log(`  ${v.color}╚${dline}╝${RESET}`);
    console.log();
    return;
  }

  if (msg.type === 'report' || msg.type === 'delegation') {
    // Bordered box
    const width = Math.min(process.stdout.columns || 80, 76);
    const line = '─'.repeat(width);
    const fromLabel = msg.agent !== AGENT_NAME ? ` от ${msg.agent}` : '';
    console.log();
    console.log(`  ${v.color}┌─ ${ts.color}${ts.label}${RESET}${fromLabel} ${DIM}${time}${RESET} ${v.color}${'─'.repeat(Math.max(0, width - ts.label.length - fromLabel.length - 10))}┐${RESET}`);
    for (const l of (msg.text || '').split('\n')) {
      console.log(`  ${v.color}│${RESET}  ${l}`);
    }
    console.log(`  ${v.color}└${line}┘${RESET}`);
    console.log();
    return;
  }

  // Simple one-liner for other types
  console.log(`  ${DIM}${time}${RESET}  ${ts.color}${ts.label}${RESET}  ${msg.text || ''}`);
}

// ==================== SSE client ====================

let messageCount = 0;
let spinTimer = null;

function startSpinner(label) {
  let idx = 0;
  const start = Date.now();
  stopSpinner();
  spinTimer = setInterval(() => {
    const elapsed = Math.round((Date.now() - start) / 1000);
    const frame = SPINNER[idx % SPINNER.length];
    process.stdout.write(`\r  ${v.color}${frame} ${label}${RESET} ${DIM}(${elapsed}s)${RESET}\x1b[K`);
    idx++;
  }, 120);
}

function stopSpinner() {
  if (spinTimer) {
    clearInterval(spinTimer);
    spinTimer = null;
    process.stdout.write('\r\x1b[K');
  }
}

function connectSSE() {
  if (!CHAT_URL) {
    console.log(`  ${DIM}Нет CHAT_URL — нечего показывать${RESET}`);
    return;
  }

  const url = new URL('/chat/stream', CHAT_URL);

  const req = http.get(url, (res) => {
    let buffer = '';

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

        if (!data) continue;

        try {
          const msg = JSON.parse(data);

          // agent_connected — показываем статус "готов"
          if (msg.type === 'agent_connected') {
            const connectedId = (msg.agentId || '').toLowerCase();
            if (connectedId === AGENT_ID) {
              stopSpinner();
              console.log(`  \x1b[92m✓ ${AGENT_NAME} подключен и готов к работе${RESET}`);
              console.log();
              startSpinner('Ожидание задачи...');
            }
            continue;
          }

          // Фильтр: что показываем в этом viewer
          const isFromMe = (msg.role || '').toLowerCase() === AGENT_ID;
          const isToMe = msg.target && (
            msg.target.toLowerCase() === AGENT_ID ||
            msg.target === 'все агенты' ||
            msg.target === 'all' ||
            msg.target === '*'
          );
          const isDelegationToMe = msg.type === 'delegation' && isToMe;
          // Лид видит report от команды (для отслеживания)
          const isReportForLead = IS_LEAD && msg.type === 'report' && !isFromMe;

          if (!isFromMe && !isDelegationToMe && !isReportForLead) continue;

          // Есть контент — остановить спиннер
          stopSpinner();

          messageCount++;
          renderMessage(msg);

          // После ответа — снова ждём
          if (msg.type === 'report' || msg.type === 'synthesis' || msg.type === 'done') {
            startSpinner('Ожидание задачи...');
          }

        } catch { /* skip parse errors */ }
      }
    });

    res.on('error', () => {
      setTimeout(connectSSE, 3000);
    });
  });

  req.on('error', () => {
    setTimeout(connectSSE, 3000);
  });
}

// ==================== Spawn agent in separate window ====================

let agentChild = null;
const isWin = process.platform === 'win32';

/**
 * Запускает нативный CLI провайдера в ОТДЕЛЬНОМ ТАБЕ терминала.
 * Таб показывает полный TUI: claude, gemini, codex, opencode.
 * ENV: CTX_CHAT_URL передаётся → MCP ctx-hub загружается из .mcp.json.
 * Задачи приходят через MCP чат (ctx_chat_history).
 */

/**
 * Запускает agent-loop.js в отдельном табе терминала.
 * agent-loop: SSE-подписка → получение delegation → запуск CLI → пост результата.
 * В табе виден процесс работы агента (лог, CLI output).
 */
function spawnAgent() {
  const agentLoop = join(__dirname, 'agent-loop.js');
  const winLoop = agentLoop.replace(/\//g, '\\');
  const fullCmd = `node "${isWin ? winLoop : agentLoop}"`;
  const title = `CTX: ${AGENT_NAME}`;

  // ENV: передаём CTX_CHAT_URL, CTX_AGENT_ID и др.
  const ctxEnvPairs = Object.entries(process.env)
    .filter(([k]) => k.startsWith('CTX_'));

  if (isWin) {
    const envSetup = ctxEnvPairs
      .map(([k, val]) => `set ${k}=${val}`)
      .join('&& ');

    agentChild = spawn('wt', [
      '-w', '0', 'nt',
      '--title', title,
      'cmd', '/k', `${envSetup}&& ${fullCmd}`,
    ], {
      shell: false,
      stdio: 'ignore',
      windowsHide: false,
    });

    agentChild.on('error', () => {
      // wt не найден — fallback
      agentChild = spawn(fullCmd, [], {
        stdio: 'ignore',
        shell: true,
        detached: true,
        cwd: process.cwd(),
        env: process.env,
      });
      agentChild.unref();
    });
  } else if (process.env.TMUX) {
    const envExport = ctxEnvPairs
      .map(([k, val]) => `${k}="${val}"`)
      .join(' ');
    spawn('tmux', ['new-window', '-n', AGENT_NAME, 'bash', '-c',
      `export ${envExport} && ${fullCmd}`,
    ], { stdio: 'ignore' });
  } else {
    agentChild = spawn(fullCmd, [], {
      stdio: 'ignore',
      shell: true,
      detached: true,
      cwd: process.cwd(),
      env: process.env,
    });
    agentChild.unref();
  }

  if (agentChild) {
    agentChild.on('exit', () => { agentChild = null; });
  }
}

function killAgent() {
  if (!agentChild) return;
  try {
    if (isWin) {
      // Убиваем дерево процессов agent-start + CLI
      spawn('taskkill', ['/pid', String(agentChild.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      agentChild.kill('SIGTERM');
    }
  } catch { /* already dead */ }
  agentChild = null;
}

// ==================== Main ====================

showHeader();
showSeparator();
startSpinner('Запуск агента...');

// 1. Запускаем фоновый агент (viewer — его хозяин)
spawnAgent();

// 2. Подключаемся к SSE для отображения ответов
connectSSE();

// Graceful shutdown — при закрытии сплита убиваем агента
function cleanup() {
  stopSpinner();
  killAgent();
  process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);
process.on('SIGHUP', cleanup);
process.on('exit', killAgent);
