#!/usr/bin/env node

/**
 * ctx interactive — интерактивный лаунчер мульти-агентного консилиума.
 *
 * Flow:
 * 1. Выбор team lead провайдера
 * 2. Выбор типа консилиума (internal / external / combo)
 * 3. Выбор команды провайдеров
 * 4. Запуск Chat Server (HTTP + SSE)
 * 5. Запуск сплитов с CTX_CHAT_URL в env (idle — без задачи)
 * 6. Чат-монитор: задачи назначаются через /task, /send, /delegate
 *    Агенты общаются через MCP → HTTP → SSE → live display
 */

import { createInterface } from 'node:readline';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import http from 'node:http';
import { createChatRoom } from '../src/ui/team-chat.js';
import { createChatServer } from '../src/orchestrator/chat-server.js';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === 'win32';

// ==================== Config ====================

const PROVIDERS = {
  claude:   { name: 'Claude Code',  cmd: 'claude',   args: ['--dangerously-skip-permissions'], color: '\x1b[35m', hasMcp: true },
  gemini:   { name: 'Gemini CLI',   cmd: 'gemini',   args: ['--yolo'],        color: '\x1b[34m', hasMcp: true },
  codex:    { name: 'Codex CLI',    cmd: 'codex',    args: ['--full-auto'],   color: '\x1b[32m', hasMcp: true },
  opencode: { name: 'OpenCode CLI', cmd: 'opencode', args: [],                color: '\x1b[33m', hasMcp: false },
};

/**
 * Построить промпт для агента — включает задачу, роль и инструкции.
 * isLead: true если этот агент — тимлид (координирует и консолидирует ответы)
 */
/**
 * Построить промпт для агента.
 *
 * Lead flow:
 *   1. Получает задачу от пользователя
 *   2. Делегирует подзадачи каждому члену команды через ctx_chat_post (type=delegation)
 *   3. Ждёт ответы через ctx_chat_history (type=report)
 *   4. Синтезирует финальный ответ (type=synthesis)
 *
 * Member flow:
 *   1. Получает делегацию от лида
 *   2. Выполняет подзадачу
 *   3. Отправляет результат через ctx_chat_post (type=report)
 *
 * teamMembers: массив id участников (для лида — чтобы знал кому делегировать)
 */
function buildTaskPrompt(provider, taskText, chatUrl, isLead = false, teamMembers = []) {
  const p = PROVIDERS[provider];

  if (isLead) {
    const memberList = teamMembers.map(id => `${id} (${PROVIDERS[id]?.name || id})`).join(', ');
    return [
      `Ты ${p.name} — TEAM LEAD мульти-агентной команды CTX.`,
      `Проект: ${process.cwd()}`,
      ``,
      `Твоя команда: ${memberList || 'нет участников'}`,
      ``,
      `ЗАДАЧА ОТ ПОЛЬЗОВАТЕЛЯ: ${taskText}`,
      ``,
      `ТВОЙ WORKFLOW:`,
      `1. Разбей задачу на подзадачи для каждого участника команды.`,
      `2. Делегируй каждому через ctx_chat_post:`,
      `   role=${provider}, agent=${p.name}, type=delegation, target=<id участника>, text=<подзадача>`,
      `3. Подожди 30-60 секунд, затем проверь ответы через ctx_chat_history (type=report).`,
      `4. Когда все ответят (или через 2 минуты) — собери синтез.`,
      `5. Отправь ФИНАЛЬНЫЙ ответ через ctx_chat_post:`,
      `   role=${provider}, agent=${p.name}, type=synthesis, text=<итоговый синтез>`,
      ``,
      `ВАЖНО:`,
      `- НЕ выполняй задачу сам — делегируй команде и синтезируй их ответы.`,
      `- НЕ создавай файлы и НЕ модифицируй код без явного запроса.`,
      `- В синтезе укажи что ответил каждый участник и твоё финальное решение.`,
    ].join('\n');
  }

  // Member prompt
  const lines = [
    `Ты ${p.name}, участник мульти-агентной команды CTX.`,
    `Проект: ${process.cwd()}`,
    ``,
    `ЗАДАЧА: ${taskText}`,
    ``,
    `ВАЖНО:`,
    `- Отвечай текстом. НЕ создавай файлы и НЕ модифицируй код без явного запроса.`,
    `- Дай краткий, содержательный ответ по задаче.`,
  ];

  if (p.hasMcp) {
    lines.push(
      ``,
      `Когда закончишь, отправь результат через MCP-инструмент ctx_chat_post`,
      `с параметрами role=${provider}, agent=${p.name}, type=report, text=твой ответ`,
    );
  }

  return lines.join('\n');
}

const CONSILIUM_TYPES = {
  internal: { name: 'Internal',  desc: 'Субагенты внутри lead-провайдера (быстрее, дешевле)' },
  external: { name: 'External',  desc: 'Отдельные CLI в сплитах терминала (визуально, независимо)' },
  combo:    { name: 'Combo',     desc: 'Lead координирует + внешние CLI в сплитах' },
};

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const WHITE = '\x1b[37m';
const RED = '\x1b[31m';

// ==================== UI helpers ====================

function clearScreen() {
  process.stdout.write('\x1b[2J\x1b[H');
}

function printBanner() {
  console.log(`
${CYAN}${BOLD}  ╔══════════════════════════════════════════╗
  ║         CTX — AI Agent Orchestrator       ║
  ╚══════════════════════════════════════════╝${RESET}
`);
}

function printBox(title, items) {
  const maxLen = Math.max(title.length, ...items.map(i => stripAnsi(i).length));
  const width = maxLen + 4;
  const line = '─'.repeat(width);

  console.log(`  ${DIM}┌${line}┐${RESET}`);
  console.log(`  ${DIM}│${RESET} ${BOLD}${title}${RESET}${' '.repeat(width - title.length - 1)}${DIM}│${RESET}`);
  console.log(`  ${DIM}├${line}┤${RESET}`);
  for (const item of items) {
    const pad = width - stripAnsi(item).length - 1;
    console.log(`  ${DIM}│${RESET} ${item}${' '.repeat(Math.max(0, pad))}${DIM}│${RESET}`);
  }
  console.log(`  ${DIM}└${line}┘${RESET}`);
}

function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ==================== Interactive input ====================

function createPrompt() {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return {
    ask(question) {
      return new Promise(resolve => {
        rl.question(question, answer => resolve(answer.trim()));
      });
    },
    close() {
      rl.close();
    }
  };
}

async function selectOne(prompt, label, options) {
  const items = options.map((opt, i) =>
    `${GREEN}${i + 1}${RESET}) ${opt.color || ''}${opt.name}${RESET}${opt.desc ? ` ${DIM}— ${opt.desc}${RESET}` : ''}`
  );

  printBox(label, items);
  console.log();

  while (true) {
    const answer = await prompt.ask(`  ${CYAN}▸${RESET} Выбор (1-${options.length}): `);
    const idx = parseInt(answer, 10) - 1;
    if (idx >= 0 && idx < options.length) {
      return options[idx];
    }
    console.log(`  ${YELLOW}Введите число от 1 до ${options.length}${RESET}`);
  }
}

async function selectMultiple(prompt, label, options, exclude = null) {
  const available = options.filter(o => o.id !== exclude);
  const selected = new Set();

  const items = available.map((opt, i) =>
    `${GREEN}${i + 1}${RESET}) ${opt.color || ''}${opt.name}${RESET}`
  );

  printBox(label, [...items, `${GREEN}a${RESET}) Выбрать всех`, `${GREEN}0${RESET}) Готово`]);
  console.log();

  while (true) {
    const current = available
      .map(o => selected.has(o.id) ? `${GREEN}✓${o.name}${RESET}` : `${DIM}○${o.name}${RESET}`)
      .join('  ');
    console.log(`  Выбрано: ${current || 'ничего'}`);

    const answer = await prompt.ask(`  ${CYAN}▸${RESET} Добавить/убрать (1-${available.length}, a=все, 0=готово): `);

    if (answer === '0') {
      if (selected.size === 0) {
        console.log(`  ${YELLOW}Выберите хотя бы одного провайдера${RESET}`);
        continue;
      }
      return available.filter(o => selected.has(o.id));
    }

    if (answer === 'a') {
      for (const o of available) selected.add(o.id);
      continue;
    }

    const idx = parseInt(answer, 10) - 1;
    if (idx >= 0 && idx < available.length) {
      const id = available[idx].id;
      if (selected.has(id)) {
        selected.delete(id);
      } else {
        selected.add(id);
      }
    }
  }
}

// ==================== Terminal detection ====================

async function detectTerminal() {
  if (process.env.TMUX) return 'tmux';

  try {
    if (isWin) {
      await execFileP('where', ['wt'], { timeout: 3000 });
      return 'wt';
    }
  } catch { /* ignore */ }

  try {
    await execFileP(isWin ? 'where' : 'which', ['wezterm'], { timeout: 3000 });
    return 'wezterm';
  } catch { /* ignore */ }

  try {
    await execFileP(isWin ? 'where' : 'which', ['tmux'], { timeout: 3000 });
    return 'tmux';
  } catch { /* ignore */ }

  return null;
}

// ==================== Terminal spawners ====================

/**
 * Запустить провайдера:
 *   1. Сплит-панель = agent-viewer.js (SSE-стрим ответов, мгновенный старт)
 *   2. Фоновый процесс = agent-start.js (выполняет CLI, постит в чат)
 *
 * Viewer стартует первым → сразу показывает хедер + спиннер.
 * Agent стартует в фоне → ответы появляются через SSE в viewer.
 */
async function spawnSplit(terminal, provider, cwd, index, chatUrl, isLead = false) {
  const providerName = PROVIDERS[provider]?.name || provider;
  const agentViewer = join(__dirname, 'agent-viewer.js').replace(/\//g, '\\');

  const wtDir = index === 0 ? '-V' : '-H';

  // === 1. Сплит-панель: viewer (лёгкий SSE-клиент) ===
  switch (terminal) {
    case 'wt': {
      const winCwd = cwd.replace(/\//g, '\\');
      const viewerEnv = [
        `set CTX_CHAT_URL=${chatUrl}`,
        `set CTX_AGENT_ID=${provider}`,
        `set CTX_AGENT_NAME=${providerName}`,
        isLead ? `set CTX_IS_LEAD=1` : '',
      ].filter(Boolean).join('&& ');
      const viewerArgs = [
        '-w', '0', 'sp', wtDir,
        '-d', winCwd,
        'cmd', '/k', `${viewerEnv}&& node "${agentViewer}"`,
      ];
      await new Promise((resolve, reject) => {
        const child = spawn('wt', viewerArgs, { shell: false, stdio: 'ignore', windowsHide: false });
        child.on('close', resolve);
        child.on('error', reject);
        setTimeout(resolve, 3000);
      });
      break;
    }

    case 'tmux': {
      const viewerPath = join(__dirname, 'agent-viewer.js');
      const envExports = [
        `CTX_CHAT_URL="${chatUrl}"`,
        `CTX_AGENT_ID="${provider}"`,
        `CTX_AGENT_NAME="${providerName}"`,
      ];
      if (isLead) envExports.push(`CTX_IS_LEAD="1"`);
      const shellCmd = `export ${envExports.join(' ')} && cd "${cwd}" && node "${viewerPath}"`;
      const dir = index === 0 ? '-h' : '-v';
      await execFileP('tmux', ['split-window', dir, '-d', 'bash', '-c', shellCmd], { timeout: 10000 });
      break;
    }

    case 'wezterm': {
      const viewerPath = join(__dirname, 'agent-viewer.js');
      const envExports = [
        `CTX_CHAT_URL="${chatUrl}"`,
        `CTX_AGENT_ID="${provider}"`,
        `CTX_AGENT_NAME="${providerName}"`,
      ];
      if (isLead) envExports.push(`CTX_IS_LEAD="1"`);
      const dir = index === 0 ? '--right' : '--bottom';
      const shellCmd = `export ${envExports.join(' ')} && node "${viewerPath}"`;
      await execFileP('wezterm', [
        'cli', 'split-pane', dir, '--cwd', cwd,
        '--', 'bash', '-c', shellCmd,
      ], { timeout: 10000 });
      break;
    }
  }

  // Agent запускается viewer-ом (agent-viewer.js → agent-start.js)
  // При закрытии сплита viewer убивает агента автоматически.
  return { provider, status: 'spawned', terminal };
}

// ==================== SSE client ====================

/**
 * Подключиться к SSE потоку chat-server и отображать сообщения в реальном времени.
 */
function connectSSE(chatUrl, chat) {
  const url = new URL('/chat/stream', chatUrl);

  const req = http.get(url, (res) => {
    let buffer = '';

    res.on('data', (chunk) => {
      buffer += chunk.toString();

      // Парсим SSE-события
      const parts = buffer.split('\n\n');
      buffer = parts.pop(); // Неполное событие остаётся в буфере

      for (const part of parts) {
        if (!part.trim() || part.startsWith(':')) continue;

        const lines = part.split('\n');
        let event = 'message';
        let data = '';

        for (const line of lines) {
          if (line.startsWith('event: ')) event = line.substring(7);
          if (line.startsWith('data: ')) data = line.substring(6);
        }

        if (event === 'message' && data) {
          try {
            const msg = JSON.parse(data);
            // agent_connected обрабатывается через onAgentChange callback — skip
            if (msg.type === 'agent_connected') return;
            // Обновляем статус при завершении
            if (msg.type === 'done' || msg.type === 'report' || msg.type === 'error') {
              const agentId = (msg.role || '').toLowerCase();
              if (agentId && chat.updateStatus) {
                chat.updateStatus(agentId, msg.type === 'error' ? 'error' : 'done');
              }
            }
            // Отображаем в main chat:
            // - delegation (задачи от лида)
            // - synthesis (финальный ответ лида)
            // - system, done, error
            // НЕ показываем report — они видны в viewer-ах агентов
            if (msg.agent !== 'User' && msg.agent !== 'System (local)') {
              if (msg.type === 'report' || msg.type === 'opinion') {
                // Skip — viewer каждого агента показывает свои ответы
              } else {
                chat.post(msg);
              }
            }
          } catch { /* ignore parse errors */ }
        }
      }
    });

    res.on('error', () => {
      // Переподключение через 3 секунды
      setTimeout(() => connectSSE(chatUrl, chat), 3000);
    });
  });

  req.on('error', () => {
    setTimeout(() => connectSSE(chatUrl, chat), 3000);
  });

  return req;
}

// ==================== HTTP post to chat server ====================

async function postToServer(chatUrl, msg) {
  try {
    const resp = await fetch(`${chatUrl}/chat/post`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(msg),
      signal: AbortSignal.timeout(5000),
    });
    return await resp.json();
  } catch {
    return null;
  }
}

// ==================== Main flow ====================

async function main() {
  const cwd = process.cwd();
  const prompt = createPrompt();

  clearScreen();
  printBanner();

  // Step 0: Detect terminal
  const terminal = await detectTerminal();
  if (terminal) {
    console.log(`  ${DIM}Терминал: ${terminal} | Платформа: ${process.platform}${RESET}\n`);
  } else {
    console.log(`  ${YELLOW}⚠ Мультиплексор не найден (wt/tmux/wezterm). Сплиты недоступны.${RESET}\n`);
  }

  // Step 1: Select lead provider (только MCP-провайдеры — лид делегирует через чат)
  const leadOptions = Object.entries(PROVIDERS)
    .filter(([, p]) => p.hasMcp)
    .map(([id, p]) => ({ id, name: p.name, color: p.color, desc: p.hasMcp ? 'MCP ✓' : '' }));

  const allProviderOptions = Object.entries(PROVIDERS).map(([id, p]) => ({
    id, name: p.name, color: p.color,
  }));

  if (leadOptions.length === 0) {
    console.log(`  ${YELLOW}⚠ Нет MCP-провайдеров для роли лида.${RESET}`);
    prompt.close();
    process.exit(1);
  }

  const lead = await selectOne(prompt, 'Выберите Team Lead (MCP)', leadOptions);
  console.log(`\n  ${GREEN}✓${RESET} Team Lead: ${lead.color}${lead.name}${RESET} ★\n`);

  // Step 2: Select consilium type
  const consiliumOptions = Object.entries(CONSILIUM_TYPES).map(([id, c]) => ({
    id, name: c.name, desc: c.desc,
  }));

  const consiliumType = await selectOne(prompt, 'Тип консилиума', consiliumOptions);
  console.log(`\n  ${GREEN}✓${RESET} Консилиум: ${consiliumType.name}\n`);

  // Step 3: Select team members (for external / combo)
  let teamMembers = [];
  if (consiliumType.id !== 'internal') {
    if (!terminal) {
      console.log(`  ${YELLOW}⚠ Сплиты недоступны без мультиплексора. Переключаюсь на internal.${RESET}\n`);
    } else {
      teamMembers = await selectMultiple(prompt, 'Выберите команду для консилиума', allProviderOptions, lead.id);
      console.log(`\n  ${GREEN}✓${RESET} Команда: ${teamMembers.map(m => `${m.color}${m.name}${RESET}`).join(', ')}\n`);
    }
  }

  // Step 4: Summary
  clearScreen();
  printBanner();

  const summaryItems = [
    `${BOLD}Team Lead:${RESET}    ${lead.color}${lead.name}${RESET}`,
    `${BOLD}Консилиум:${RESET}   ${consiliumType.name}`,
    `${BOLD}Терминал:${RESET}    ${terminal || 'нет'}`,
    `${BOLD}Chat:${RESET}        HTTP + SSE (live)`,
  ];
  if (teamMembers.length > 0) {
    summaryItems.push(`${BOLD}Команда:${RESET}     ${teamMembers.map(m => m.name).join(', ')}`);
  }

  printBox('Запуск консилиума', summaryItems);

  // Агенты стартуют в интерактивном режиме (без задачи).
  // Задачи назначаются через /task после запуска.
  const isIdle = true;
  console.log(`\n  ${CYAN}◎${RESET} Агенты стартуют в интерактивном режиме. Используйте ${GREEN}/task${RESET} для назначения задач.\n`);

  prompt.close();

  // Step 5: Start Chat Server
  const chatServer = createChatServer();
  const chatPort = await chatServer.start(0);
  const chatUrl = `http://127.0.0.1:${chatPort}`;

  // Local chat room for display with lead badge
  const chat = createChatRoom({ autoScroll: true, leadId: lead.id });

  console.log();
  chat.separator('CTX Team Session');
  chat.postSystem(`Chat Server запущен: ${chatUrl}`);

  // Connect SSE — получаем сообщения от агентов в реальном времени
  const sseConnection = connectSSE(chatUrl, chat);

  // Build team roster
  const allMembers = [
    { name: lead.name, role: lead.id, provider: lead.id },
    ...teamMembers.map(m => ({ name: m.name, role: m.id, provider: m.id })),
  ];

  // Add internal roles for combo/internal
  if (consiliumType.id !== 'external') {
    allMembers.push(
      { name: 'ArchitectBot', role: 'architect' },
      { name: 'ReviewerBot',  role: 'reviewer' },
      { name: 'TesterBot',    role: 'tester' },
    );
  }

  chat.showTeam(allMembers);

  // Register team on server too
  await postToServer(chatUrl, {
    role: 'system', type: 'system',
    text: `Консилиум: ${consiliumType.name} | Терминал: ${terminal || 'нет'} | Команда: ${allMembers.map(m => m.name).join(', ')}`,
  });

  chat.separator('Запуск агентов');
  if (isIdle) {
    chat.postSystem('Режим: IDLE — агенты стартуют без задачи');
    chat.postSystem(`Используйте ${GREEN}/task${RESET} или ${GREEN}/send${RESET} для назначения задач`);
  } else {
    chat.postSystem(`Задача: ${taskText}`);
  }

  // Step 6: Spawn agents — с задачей или idle
  const spawnedProviders = [];
  const skippedProviders = [];

  if (terminal) {
    // Lead — первый сплит + таб
    try {
      const result = await spawnSplit(terminal, lead.id, cwd, 0, chatUrl, true);
      chat.postSystem(`${lead.color}${lead.name}${RESET} ★ Lead → viewer + CLI tab`);
      spawnedProviders.push({ id: lead.id, name: lead.name, role: 'lead' });
    } catch (err) {
      chat.postError('system', null, `Lead ${lead.name}: ${err.message}`);
    }

    // Team members — сплиты + табы
    let splitIdx = spawnedProviders.length;
    for (const member of teamMembers) {
      try {
        const result = await spawnSplit(terminal, member.id, cwd, splitIdx, chatUrl);
        chat.postSystem(`${member.color}${member.name}${RESET} → viewer + CLI tab`);
        spawnedProviders.push({ id: member.id, name: member.name, role: 'member' });
        splitIdx++;
      } catch (err) {
        chat.postError('system', null, `${member.name}: ${err.message}`);
      }
    }

    if (skippedProviders.length > 0 && isIdle) {
      chat.postSystem(`${DIM}Подсказка: ${skippedProviders.map(p => p.name).join(', ')} можно запустить с задачей через /send${RESET}`);
    }
  }

  chat.separator(isIdle ? 'Агенты готовы — ожидают задачи' : 'Агенты работают');

  // Регистрируем агентов для статус-дашборда
  for (const p of spawnedProviders) {
    chat.registerAgent(p.id, p.name);
  }
  chat.showStatusDashboard();

  // Трекинг подключений и завершений агентов
  const connectedAgents = new Set();
  const agentStartTimes = new Map();

  chatServer.onAgentChange((event, agent) => {
    if (event === 'connected') {
      connectedAgents.add(agent.id);
      agentStartTimes.set(agent.id, Date.now());
      chat.updateStatus(agent.id, 'working');
      const color = PROVIDERS[agent.id]?.color || '';
      chat.postSystem(`${color}${agent.name}${RESET} ◉ подключен, работает...`);
    }
  });

  if (isIdle) {
    chat.postSystem('Агенты в idle-режиме. Назначьте задачу через /task или /send.');
  } else {
    chat.postSystem('Агенты запущены. Ответы появятся в чате.');
  }
  printChatHelp();

  // Step 7: Main screen = live chat monitor
  await runChatMonitor(chat, chatServer, chatUrl, terminal, spawnedProviders, skippedProviders, cwd, sseConnection);
}

// ==================== Chat help ====================

function printChatHelp() {
  console.log(`
  ${DIM}Команды чата:${RESET}
    ${GREEN}/task${RESET} ${DIM}<текст>${RESET}              — отправить задачу ${BOLD}всем${RESET} агентам (через MCP)
    ${GREEN}/send${RESET} ${DIM}<провайдер> <текст>${RESET}  — задача конкретному агенту
    ${GREEN}/delegate${RESET} ${DIM}<провайдер> <текст>${RESET} — делегировать задачу
    ${GREEN}/status${RESET}                     — статус сессии и SSE клиенты
    ${GREEN}/history${RESET}                    — последние сообщения
    ${GREEN}/team${RESET}                       — состав команды
    ${GREEN}/capture${RESET} ${DIM}<pane>${RESET}             — захват вывода панели (tmux)
    ${GREEN}/help${RESET}                       — эта справка
    ${GREEN}/quit${RESET}                       — завершить сессию
    ${DIM}Просто текст${RESET}                  — сообщение в чат от User
`);
}

// ==================== Chat monitor ====================

async function runChatMonitor(chat, chatServer, chatUrl, terminal, spawnedProviders, skippedProviders, cwd, sseConnection) {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  // Маппинг провайдера → индекс панели
  const providerPaneMap = {};
  spawnedProviders.forEach((p, i) => {
    providerPaneMap[p.id] = i;
  });

  function findProvider(query) {
    const q = query.toLowerCase();
    return spawnedProviders.find(p =>
      p.id === q || p.name.toLowerCase().startsWith(q)
    );
  }

  const askNext = () => {
    rl.question(`  ${CYAN}chat▸${RESET} `, async (input) => {
      const cmd = input.trim();

      if (!cmd) {
        askNext();
        return;
      }

      // /quit
      if (cmd === '/quit' || cmd === '/exit' || cmd === '/q') {
        chat.separator('Сессия завершена');
        sseConnection.destroy();
        await chatServer.stop();
        rl.close();
        process.exit(0);
        return;
      }

      // /help
      if (cmd === '/help' || cmd === '/h') {
        printChatHelp();
        askNext();
        return;
      }

      // /status
      if (cmd === '/status') {
        try {
          const [pingResp, agentsResp] = await Promise.all([
            fetch(`${chatUrl}/chat/ping`, { signal: AbortSignal.timeout(3000) }),
            fetch(`${chatUrl}/chat/agents`, { signal: AbortSignal.timeout(3000) }),
          ]);
          const info = await pingResp.json();
          const agentsData = await agentsResp.json();

          chat.separator('Статус сессии');

          // Показываем статус каждого агента
          for (const p of spawnedProviders) {
            const agentInfo = agentsData.agents?.find(a => a.id === p.id);
            const color = PROVIDERS[p.id]?.color || '';
            if (agentInfo) {
              const alive = agentInfo.alive;
              const since = new Date(agentInfo.connectedAt).toLocaleTimeString('ru-RU', { hour12: false });
              const lastSeen = new Date(agentInfo.lastSeen).toLocaleTimeString('ru-RU', { hour12: false });
              const statusIcon = alive ? `${GREEN}●${RESET}` : `${RED}○${RESET}`;
              chat.postSystem(`${statusIcon} ${color}${p.name}${RESET} — ${alive ? 'активен' : 'не отвечает'} | подкл: ${since} | послед: ${lastSeen}`);
            } else {
              chat.postSystem(`${RED}○${RESET} ${color}${p.name}${RESET} — не подключен (MCP не инициализирован)`);
            }
          }

          chat.postSystem(`SSE клиенты: ${info.clients} | Сообщений: ${info.messages} | Терминал: ${terminal}`);
        } catch {
          chat.postSystem(`Chat Server недоступен (${chatUrl})`);
        }
        askNext();
        return;
      }

      // /team
      if (cmd === '/team') {
        const members = spawnedProviders.map(p => ({
          name: p.name, role: p.role, provider: p.id,
        }));
        chat.showTeam(members);
        askNext();
        return;
      }

      // /history [count]
      if (cmd.startsWith('/history')) {
        const count = parseInt(cmd.split(' ')[1], 10) || 20;
        try {
          const resp = await fetch(`${chatUrl}/chat/history?count=${count}`, { signal: AbortSignal.timeout(3000) });
          const data = await resp.json();
          chat.separator(`История (${data.total} сообщений)`);
          for (const msg of data.messages) {
            const time = new Date(msg.ts).toLocaleTimeString('ru-RU', { hour12: false });
            const role = msg.role || 'system';
            const agent = msg.agent || '';
            const type = msg.type || '';
            console.log(`  ${DIM}${time}${RESET}  ${role}${agent ? ':' + agent : ''}  [${type}]  ${msg.text}`);
          }
        } catch {
          const msgs = chat.getHistory(count);
          if (msgs.length === 0) {
            console.log(`  ${DIM}Нет сообщений${RESET}`);
          }
        }
        askNext();
        return;
      }

      // /task <text> — отправить задачу ЛИДУ (он делегирует команде и синтезирует)
      if (cmd.startsWith('/task ')) {
        const broadcastText = cmd.substring(6).trim();
        if (!broadcastText) {
          console.log(`  ${YELLOW}Укажите задачу: /task <текст>${RESET}`);
          askNext();
          return;
        }

        // Находим лида среди запущенных
        const leadProvider = spawnedProviders.find(p => p.role === 'lead');
        const leadId = leadProvider?.id || lead.id;

        // Пост через HTTP — задача идёт ТОЛЬКО лиду
        const result = await postToServer(chatUrl, {
          role: 'lead',
          agent: 'User',
          type: 'delegation',
          text: broadcastText,
          target: leadId,
        });

        if (result) {
          chat.postDelegation('lead', 'User', broadcastText, `★ ${leadProvider?.name || lead.name}`);
          chat.postSystem(`Задача отправлена лиду → ${leadProvider?.name || lead.name} делегирует команде`);
        } else {
          chat.postError('system', null, 'Не удалось отправить на Chat Server');
        }

        // Пропущенные non-MCP — спавним, но они получат задачу через делегацию лида
        if (skippedProviders.length > 0 && terminal) {
          const toSpawn = [...skippedProviders];
          for (const skipped of toSpawn) {
            // Non-MCP агенты не могут получить делегацию от лида через chat
            // Спавним их напрямую с задачей
            chat.postSystem(`${skipped.name} (no MCP) — запускаю с задачей напрямую...`);
            try {
              const res = await spawnSplit(terminal, skipped.id, cwd, spawnedProviders.length, chatUrl);
              chat.postSystem(`${PROVIDERS[skipped.id]?.color || ''}${skipped.name}${RESET} → ${res.terminal} split [${GREEN}task${RESET}]`);
              spawnedProviders.push({ id: skipped.id, name: skipped.name, role: 'member' });
              const idx = skippedProviders.findIndex(p => p.id === skipped.id);
              if (idx !== -1) skippedProviders.splice(idx, 1);
            } catch (err) {
              chat.postError('system', null, `${skipped.name}: ${err.message}`);
            }
          }
        }
        askNext();
        return;
      }

      // /send <provider> <text>
      if (cmd.startsWith('/send ')) {
        const parts = cmd.substring(6).trim().split(/\s+/);
        const providerQuery = parts[0];
        const sendTaskText = parts.slice(1).join(' ');

        if (!providerQuery || !sendTaskText) {
          const allAvailable = [...spawnedProviders.map(p => p.id), ...skippedProviders.map(p => p.id)];
          console.log(`  ${YELLOW}Формат: /send <провайдер> <текст>${RESET}`);
          console.log(`  ${DIM}Доступные: ${allAvailable.join(', ')}${RESET}`);
          askNext();
          return;
        }

        // Ищем среди запущенных
        let target = findProvider(providerQuery);

        if (target) {
          // MCP-провайдер — шлём через чат
          await postToServer(chatUrl, {
            role: 'lead',
            agent: 'User',
            type: 'delegation',
            text: sendTaskText,
            target: target.id,
          });
          chat.post({
            role: 'lead',
            agent: 'User',
            type: 'delegation',
            text: `→ ${target.name}: ${sendTaskText}`,
          });
          chat.postSystem(`Задача для ${target.name} опубликована → MCP`);
        } else {
          // Ищем среди пропущенных (non-MCP) — спавним с задачей
          const skipped = skippedProviders.find(p =>
            p.id === providerQuery.toLowerCase() || p.name.toLowerCase().startsWith(providerQuery.toLowerCase())
          );
          if (skipped && terminal) {
            chat.postSystem(`${skipped.name} не имеет MCP — запускаю новый сплит с задачей...`);
            try {
              const result = await spawnSplit(terminal, skipped.id, cwd, spawnedProviders.length, chatUrl);
              chat.postSystem(`${PROVIDERS[skipped.id]?.color || ''}${skipped.name}${RESET} → ${result.terminal} split [${GREEN}task${RESET}]`);
              spawnedProviders.push({ id: skipped.id, name: skipped.name, role: 'member' });
              // Убираем из пропущенных
              const idx = skippedProviders.findIndex(p => p.id === skipped.id);
              if (idx !== -1) skippedProviders.splice(idx, 1);
            } catch (err) {
              chat.postError('system', null, `${skipped.name}: ${err.message}`);
            }
          } else {
            const allAvailable = [...spawnedProviders.map(p => p.id), ...skippedProviders.map(p => p.id)];
            console.log(`  ${YELLOW}Провайдер "${providerQuery}" не найден. Доступные: ${allAvailable.join(', ')}${RESET}`);
          }
        }
        askNext();
        return;
      }

      // /delegate <provider> <text>
      if (cmd.startsWith('/delegate ') || cmd.startsWith('/d ')) {
        const prefix = cmd.startsWith('/delegate ') ? '/delegate ' : '/d ';
        const parts = cmd.substring(prefix.length).trim().split(/\s+/);
        const providerQuery = parts[0];
        const taskText = parts.slice(1).join(' ');

        if (!providerQuery || !taskText) {
          console.log(`  ${YELLOW}Формат: /delegate <провайдер> <текст>${RESET}`);
          askNext();
          return;
        }

        const target = findProvider(providerQuery);
        if (!target) {
          console.log(`  ${YELLOW}Провайдер "${providerQuery}" не найден${RESET}`);
          askNext();
          return;
        }

        await postToServer(chatUrl, {
          role: 'lead',
          agent: 'User',
          type: 'delegation',
          text: taskText,
          target: target.id,
        });

        chat.postDelegation('lead', 'User', taskText, target.id);
        chat.postSystem(`Делегировано → ${target.name} (MCP)`);
        askNext();
        return;
      }

      // /capture <pane>
      if (cmd.startsWith('/capture ') || cmd.startsWith('/c ')) {
        const pane = cmd.split(' ')[1];
        if (pane && terminal === 'tmux') {
          try {
            const { stdout } = await execFileP('tmux', [
              'capture-pane', '-t', pane, '-p', '-S', '-30'
            ], { timeout: 5000 });
            chat.separator(`Pane ${pane}`);
            console.log(stdout);
          } catch (err) {
            chat.postError('system', null, `Capture failed: ${err.message}`);
          }
        } else {
          console.log(`  ${DIM}Capture доступен только в tmux${RESET}`);
        }
        askNext();
        return;
      }

      // Любой текст → задача лиду (как /task)
      const leadProvider = spawnedProviders.find(p => p.role === 'lead');
      const leadTarget = leadProvider?.id || lead.id;

      await postToServer(chatUrl, {
        role: 'lead',
        agent: 'User',
        type: 'delegation',
        text: cmd,
        target: leadTarget,
      });

      chat.postDelegation('lead', 'User', cmd, `★ ${leadProvider?.name || lead.name}`);

      askNext();
    });
  };

  // Обработка Ctrl+C
  const cleanup = async () => {
    chat.separator('Сессия завершена');
    sseConnection.destroy();
    await chatServer.stop().catch(() => {});
    rl.close();
    process.exit(0);
  };

  rl.on('close', cleanup);
  process.on('SIGINT', cleanup);

  askNext();
}

main().catch(err => {
  console.error(`\n  ${YELLOW}Error: ${err.message}${RESET}`);
  process.exit(1);
});
