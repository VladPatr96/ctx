/**
 * Terminal Spawner — запуск CLI агентов в визуальных сплитах.
 *
 * Поддержка:
 * - Windows Terminal (wt) — нативный PowerShell/CMD
 * - tmux — WSL / Linux / macOS
 * - WezTerm (wezterm cli) — кроссплатформенный
 *
 * Автоматически определяет доступный терминал.
 */

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';

const execFileP = promisify(execFile);
const isWin = process.platform === 'win32';

// ==================== Provider CLI commands ====================

const PROVIDER_COMMANDS = {
  claude: { cmd: 'claude', args: ['--dangerously-skip-permissions'], readyMarker: /[❯$>]/ },
  gemini: { cmd: 'gemini', args: ['--yolo'], readyMarker: /Type your message/ },
  codex:  { cmd: 'codex',  args: ['--full-auto'], readyMarker: /[>]/ },
  opencode: { cmd: 'opencode', args: [], readyMarker: /[>]/ },
};

// ==================== Terminal detection ====================

async function commandExists(cmd) {
  try {
    const which = isWin ? 'where' : 'which';
    await execFileP(which, [cmd], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

async function isTmuxSession() {
  return !!process.env.TMUX;
}

/**
 * Определяет доступный терминал-мультиплексор.
 * @returns {Promise<'tmux'|'wt'|'wezterm'|null>}
 */
export async function detectTerminal() {
  // tmux — если мы уже внутри tmux-сессии
  if (await isTmuxSession()) return 'tmux';

  // Windows Terminal CLI
  if (isWin && await commandExists('wt')) return 'wt';

  // WezTerm CLI
  if (await commandExists('wezterm')) return 'wezterm';

  // tmux доступен, но не внутри сессии
  if (await commandExists('tmux')) return 'tmux';

  return null;
}

// ==================== Layout builders ====================

/**
 * Построить команду запуска провайдера с задачей.
 */
function buildProviderCommand(provider, task, cwd) {
  const p = PROVIDER_COMMANDS[provider];
  if (!p) throw new Error(`Unknown provider: ${provider}`);

  const parts = [p.cmd, ...p.args];

  // Для codex задача передаётся как аргумент
  if (provider === 'codex' && task) {
    parts.push(JSON.stringify(task));
  }

  return { shellCmd: parts.join(' '), cwd, sendTask: provider !== 'codex' ? task : null };
}

// ==================== tmux spawner ====================

async function spawnTmux(agents, opts = {}) {
  const { cwd } = opts;
  const results = [];

  for (let i = 0; i < agents.length; i++) {
    const { provider, task, agentId } = agents[i];
    const agentCwd = agents[i].cwd || cwd || process.cwd();
    const { shellCmd, sendTask } = buildProviderCommand(provider, task, agentCwd);

    // Определяем направление сплита
    const direction = i % 2 === 0 ? '-h' : '-v';
    const paneName = agentId || `agent-${i}`;

    try {
      // Создаём панель
      await execFileP('tmux', [
        'split-window', direction, '-d',
        '-c', agentCwd,
        'bash', '-c', `echo "=== ${paneName} (${provider}) ===" && ${shellCmd}`
      ], { timeout: 10000 });

      // Если нужно отправить задачу отдельно (gemini, opencode)
      if (sendTask) {
        await new Promise(r => setTimeout(r, 3000)); // Ждём запуска CLI
        const target = `{bottom}`;
        await execFileP('tmux', ['send-keys', '-t', target, sendTask], { timeout: 5000 });
        await execFileP('tmux', ['send-keys', '-t', target, 'Enter'], { timeout: 5000 });
      }

      results.push({ agentId: paneName, provider, status: 'spawned', terminal: 'tmux' });
    } catch (err) {
      results.push({ agentId: paneName, provider, status: 'error', error: err.message, terminal: 'tmux' });
    }
  }

  return results;
}

// ==================== Windows Terminal (wt) spawner ====================

async function spawnWt(agents, opts = {}) {
  const { cwd } = opts;
  const results = [];

  for (let i = 0; i < agents.length; i++) {
    const { provider, task, agentId } = agents[i];
    const agentCwd = agents[i].cwd || cwd || process.cwd();
    const { shellCmd } = buildProviderCommand(provider, task, agentCwd);
    const paneName = agentId || `agent-${i}`;

    // wt: -V = вертикальный, -H = горизонтальный
    const direction = i % 2 === 0 ? '-V' : '-H';

    try {
      const winCwd = agentCwd.replace(/\//g, '\\');
      const fullCmd = `wt -w 0 sp ${direction} -d "${winCwd}" powershell -ExecutionPolicy Bypass -NoExit -Command "${shellCmd}"`;
      await new Promise((resolve, reject) => {
        const child = spawn(fullCmd, [], { shell: true, stdio: 'ignore' });
        child.on('close', resolve);
        child.on('error', reject);
        setTimeout(resolve, 3000);
      });

      results.push({ agentId: paneName, provider, status: 'spawned', terminal: 'wt' });
    } catch (err) {
      results.push({ agentId: paneName, provider, status: 'error', error: err.message, terminal: 'wt' });
    }
  }

  return results;
}

// ==================== WezTerm spawner ====================

async function spawnWezterm(agents, opts = {}) {
  const { cwd } = opts;
  const results = [];

  for (let i = 0; i < agents.length; i++) {
    const { provider, task, agentId } = agents[i];
    const agentCwd = agents[i].cwd || cwd || process.cwd();
    const { shellCmd } = buildProviderCommand(provider, task, agentCwd);
    const paneName = agentId || `agent-${i}`;

    const direction = i % 2 === 0 ? '--right' : '--bottom';

    try {
      await execFileP('wezterm', [
        'cli', 'split-pane', direction,
        '--cwd', agentCwd,
        '--', 'bash', '-c', shellCmd,
      ], { timeout: 10000 });

      results.push({ agentId: paneName, provider, status: 'spawned', terminal: 'wezterm' });
    } catch (err) {
      results.push({ agentId: paneName, provider, status: 'error', error: err.message, terminal: 'wezterm' });
    }
  }

  return results;
}

// ==================== Main API ====================

/**
 * Запустить агентов в визуальных сплитах терминала.
 *
 * @param {Array<{agentId: string, provider: string, task: string, cwd?: string}>} agents
 * @param {object} [opts]
 * @param {'tmux'|'wt'|'wezterm'|'auto'} [opts.terminal='auto'] — терминал
 * @param {string} [opts.cwd] — рабочая директория по умолчанию
 * @returns {Promise<{terminal: string, agents: object[]}>}
 */
export async function spawnAgentSplits(agents, opts = {}) {
  const { terminal: requestedTerminal = 'auto', cwd } = opts;

  if (!agents || agents.length === 0) {
    throw new Error('At least one agent spec is required');
  }

  if (agents.length > 6) {
    throw new Error('Maximum 6 agents for split panes');
  }

  // Detect terminal
  let terminal = requestedTerminal;
  if (terminal === 'auto') {
    terminal = await detectTerminal();
    if (!terminal) {
      throw new Error(
        'No supported terminal multiplexer found. Install one of: tmux (WSL), Windows Terminal (wt), WezTerm'
      );
    }
  }

  let results;
  switch (terminal) {
    case 'tmux':
      results = await spawnTmux(agents, { cwd });
      break;
    case 'wt':
      results = await spawnWt(agents, { cwd });
      break;
    case 'wezterm':
      results = await spawnWezterm(agents, { cwd });
      break;
    default:
      throw new Error(`Unsupported terminal: ${terminal}`);
  }

  return {
    terminal,
    spawned: results.filter(r => r.status === 'spawned').length,
    failed: results.filter(r => r.status === 'error').length,
    agents: results,
  };
}

/**
 * Прочитать вывод панели tmux.
 * @param {string} target — цель панели (номер или {right}, {bottom})
 * @param {number} [lines=100]
 * @returns {Promise<string>}
 */
export async function captureTmuxPane(target, lines = 100) {
  try {
    const { stdout } = await execFileP('tmux', [
      'capture-pane', '-t', target, '-p', '-S', `-${lines}`
    ], { timeout: 5000 });
    return stdout;
  } catch (err) {
    throw new Error(`Cannot capture pane ${target}: ${err.message}`);
  }
}
