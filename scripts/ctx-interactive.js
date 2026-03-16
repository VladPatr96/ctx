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
import { createChatRoom } from './ui/team-chat.js';
import { createChatServer } from './orchestrator/chat-server.js';

const execFileP = promisify(execFile);
const __dirname = dirname(fileURLToPath(import.meta.url));
const isWin = process.platform === 'win32';

// ==================== Config ====================

const PROVIDERS = {
  claude:   { name: 'Claude Code',  cmd: 'claude',   args: ['--dangerously-skip-permissions'], color: '\x1b[35m', hasMcp: true },
  gemini:   { name: 'Gemini CLI',   cmd: 'gemini',   args: ['--yolo'],        color: '\x1b[34m', hasMcp: true },
  codex:    { name: 'Codex CLI',    cmd: 'codex',    args: ['--full-auto'],   color: '\x1b[32m', hasMcp: false },
  opencode: { name: 'OpenCode CLI', cmd: 'opencode', args: [],                color: '\x1b[33m', hasMcp: false },
};

/**
 * Построить промпт для агента — включает задачу и инструкции по MCP чату.
 */
function buildTaskPrompt(provider, taskText, chatUrl) {
  const p = PROVIDERS[provider];
  const lines = [
    `Ты ${p.name}, участник мульти-агентной команды CTX.`,
    `Проект: ${process.cwd()}`,
    ``,
    `ЗАДАЧА: ${taskText}`,
    ``,
    `Выполни задачу. Работай в этом проекте.`,
  ];

  if (p.hasMcp) {
    lines.push(
      ``,
      `Когда закончишь, отправь краткий результат через MCP-инструмент ctx_chat_post`,
      `с параметрами role=${provider}, agent=${p.name}, type=result, text=твой результат`,
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
 * Запустить провайдера в сплите с CTX_CHAT_URL в окружении.
 */
/**
 * Запустить провайдера в сплите — интерактивный режим с задачей.
 * Пишет промпт задачи в temp файл → agent-start.js читает его и запускает CLI.
 * stdio: inherit → пользователь видит нативный UI провайдера.
 */
async function spawnSplit(terminal, provider, cwd, index, chatUrl, taskText) {
  const providerName = PROVIDERS[provider]?.name || provider;
  const agentStart = join(__dirname, 'agent-start.js').replace(/\//g, '\\');

  // Записываем промпт задачи в temp файл (обходим проблемы с кавычками в cmd)
  const taskPrompt = buildTaskPrompt(provider, taskText, chatUrl);
  const taskFile = join(tmpdir(), `ctx-task-${provider}-${Date.now()}.txt`).replace(/\//g, '\\');
  writeFileSync(taskFile, taskPrompt, 'utf-8');

  // Первый сплит — вертикальный, остальные — горизонтальные
  const wtDir = index === 0 ? '-V' : '-H';

  switch (terminal) {
    case 'wt': {
      const winCwd = cwd.replace(/\//g, '\\');
      const envSetup = [
        `set CTX_CHAT_URL=${chatUrl}`,
        `set CTX_AGENT_ID=${provider}`,
        `set CTX_AGENT_NAME=${providerName}`,
        `set CTX_TASK_FILE=${taskFile}`,
      ].join('&& ');
      const args = [
        '-w', '0', 'sp', wtDir,
        '-d', winCwd,
        'cmd', '/k', `${envSetup}&& node "${agentStart}"`,
      ];
      await new Promise((resolve, reject) => {
        const child = spawn('wt', args, {
          shell: false,
          stdio: 'ignore',
          windowsHide: false,
        });
        child.on('close', resolve);
        child.on('error', reject);
        setTimeout(resolve, 5000);
      });
      return { provider, status: 'spawned', terminal: 'wt' };
    }

    case 'tmux': {
      const startPath = join(__dirname, 'agent-start.js');
      const taskFileUnix = taskFile.replace(/\\/g, '/');
      const shellCmd = `export CTX_CHAT_URL="${chatUrl}" CTX_AGENT_ID="${provider}" CTX_AGENT_NAME="${providerName}" CTX_TASK_FILE="${taskFileUnix}" && cd "${cwd}" && node "${startPath}"`;
      const dir = index === 0 ? '-h' : '-v';
      await execFileP('tmux', ['split-window', dir, '-d', 'bash', '-c', shellCmd], { timeout: 10000 });
      return { provider, status: 'spawned', terminal: 'tmux' };
    }

    case 'wezterm': {
      const startPath = join(__dirname, 'agent-start.js');
      const taskFileUnix = taskFile.replace(/\\/g, '/');
      const dir = index === 0 ? '--right' : '--bottom';
      const shellCmd = `export CTX_CHAT_URL="${chatUrl}" CTX_AGENT_ID="${provider}" CTX_AGENT_NAME="${providerName}" CTX_TASK_FILE="${taskFileUnix}" && node "${startPath}"`;
      await execFileP('wezterm', [
        'cli', 'split-pane', dir, '--cwd', cwd,
        '--', 'bash', '-c', shellCmd,
      ], { timeout: 10000 });
      return { provider, status: 'spawned', terminal: 'wezterm' };
    }

    default:
      return { provider, status: 'error', error: `Unknown terminal: ${terminal}` };
  }
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
            // Отображаем в локальном чате (если не от нас самих)
            if (msg.agent !== 'User' && msg.agent !== 'System (local)') {
              chat.post(msg);
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

  // Step 1: Select lead provider
  const providerOptions = Object.entries(PROVIDERS).map(([id, p]) => ({
    id, name: p.name, color: p.color,
  }));

  const lead = await selectOne(prompt, 'Выберите Team Lead', providerOptions);
  console.log(`\n  ${GREEN}✓${RESET} Team Lead: ${lead.color}${lead.name}${RESET}\n`);

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
      teamMembers = await selectMultiple(prompt, 'Выберите команду для консилиума', providerOptions, lead.id);
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

  // Step 5: Enter task — агенты запустятся с этой задачей
  console.log();
  console.log(`  ${BOLD}Введите задачу для команды:${RESET}`);
  const taskText = await prompt.ask(`  ${CYAN}▸${RESET} Задача: `);
  if (!taskText.trim()) {
    console.log(`\n  ${YELLOW}Задача не указана. Отменено.${RESET}`);
    prompt.close();
    process.exit(0);
  }
  console.log(`\n  ${GREEN}✓${RESET} Задача: ${taskText}\n`);

  prompt.close();

  // Step 5: Start Chat Server
  const chatServer = createChatServer();
  const chatPort = await chatServer.start(0);
  const chatUrl = `http://127.0.0.1:${chatPort}`;

  // Local chat room for display
  const chat = createChatRoom({ autoScroll: true });

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
  chat.postSystem(`Задача: ${taskText}`);

  // Step 6: Spawn agents с задачей — каждый CLI запускается в интерактивном режиме
  const spawnedProviders = [];

  if (terminal) {
    // Lead — первый сплит
    try {
      const result = await spawnSplit(terminal, lead.id, cwd, 0, chatUrl, taskText);
      chat.postSystem(`${lead.color}${lead.name}${RESET} (Lead) → ${result.terminal} split`);
      spawnedProviders.push({ id: lead.id, name: lead.name, role: 'lead' });
    } catch (err) {
      chat.postError('system', null, `Lead ${lead.name}: ${err.message}`);
    }

    // Team members — дополнительные сплиты
    for (let i = 0; i < teamMembers.length; i++) {
      const member = teamMembers[i];
      try {
        const result = await spawnSplit(terminal, member.id, cwd, i + 1, chatUrl, taskText);
        chat.postSystem(`${member.color}${member.name}${RESET} → ${result.terminal} split`);
        spawnedProviders.push({ id: member.id, name: member.name, role: 'member' });
      } catch (err) {
        chat.postError('system', null, `${member.name}: ${err.message}`);
      }
    }
  }

  chat.separator('Агенты работают');

  // Трекинг подключений агентов
  const connectedAgents = new Set();
  chatServer.onAgentChange((event, agent) => {
    if (event === 'connected') {
      connectedAgents.add(agent.id);
      const color = PROVIDERS[agent.id]?.color || '';
      chat.postSystem(`${color}${agent.name}${RESET} ✓ подключен, работает над задачей`);
    }
  });

  chat.postSystem('Агенты запущены с задачей. Наблюдайте за их работой в сплитах.');
  chat.postSystem('Результаты от MCP-агентов (Claude, Gemini) появятся в чате автоматически.');
  printChatHelp();

  // Step 7: Main screen = live chat monitor
  await runChatMonitor(chat, chatServer, chatUrl, terminal, spawnedProviders, sseConnection);
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

async function runChatMonitor(chat, chatServer, chatUrl, terminal, spawnedProviders, sseConnection) {
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

      // /task <text> — отправить задачу ВСЕМ агентам через chat server
      if (cmd.startsWith('/task ')) {
        const taskText = cmd.substring(6).trim();
        if (!taskText) {
          console.log(`  ${YELLOW}Укажите задачу: /task <текст>${RESET}`);
          askNext();
          return;
        }

        // Пост через HTTP — все агенты увидят через ctx_chat_history
        const result = await postToServer(chatUrl, {
          role: 'lead',
          agent: 'User',
          type: 'delegation',
          text: taskText,
          target: 'все агенты',
        });

        if (result) {
          chat.postDelegation('lead', 'User', taskText, 'все агенты');
          chat.postSystem('Задача опубликована на Chat Server — агенты получат через MCP (ctx_chat_history)');
        } else {
          chat.postError('system', null, 'Не удалось отправить на Chat Server');
        }
        askNext();
        return;
      }

      // /send <provider> <text>
      if (cmd.startsWith('/send ')) {
        const parts = cmd.substring(6).trim().split(/\s+/);
        const providerQuery = parts[0];
        const taskText = parts.slice(1).join(' ');

        if (!providerQuery || !taskText) {
          console.log(`  ${YELLOW}Формат: /send <провайдер> <текст>${RESET}`);
          console.log(`  ${DIM}Доступные: ${spawnedProviders.map(p => p.id).join(', ')}${RESET}`);
          askNext();
          return;
        }

        const target = findProvider(providerQuery);
        if (!target) {
          console.log(`  ${YELLOW}Провайдер "${providerQuery}" не найден. Доступные: ${spawnedProviders.map(p => p.id).join(', ')}${RESET}`);
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

        chat.post({
          role: 'lead',
          agent: 'User',
          type: 'delegation',
          text: `→ ${target.name}: ${taskText}`,
        });

        chat.postSystem(`Задача для ${target.name} опубликована → MCP`);
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

      // Любой другой текст — сообщение от пользователя (в сервер + локальный чат)
      await postToServer(chatUrl, {
        role: 'lead',
        agent: 'User',
        type: 'opinion',
        text: cmd,
      });

      chat.post({
        role: 'lead',
        agent: 'User',
        type: 'opinion',
        text: cmd,
      });

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
