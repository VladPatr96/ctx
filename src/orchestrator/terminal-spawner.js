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
import { writeFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { shellEscape } from '../core/utils/shell.js';

const execFileP = promisify(execFile);
const isWin = process.platform === 'win32';

// ==================== Provider CLI commands ====================

// Interactive TUI mode (for manual sessions)
const PROVIDER_COMMANDS_TUI = {
  claude: { cmd: 'claude', args: ['--dangerously-skip-permissions'], readyMarker: /[❯$>]/ },
  gemini: { cmd: 'gemini', args: ['--yolo'], readyMarker: /Type your message/ },
  codex:  { cmd: 'codex',  args: ['--full-auto'], readyMarker: /[>]/ },
  opencode: { cmd: 'opencode', args: [], readyMarker: /[>]/ },
};

/**
 * Headless commands that read prompt from a file (avoids shell escaping issues).
 * Returns a shell command string that reads promptFile and pipes/passes to CLI.
 * @param {string} promptFile — path to prompt file on disk
 * @param {string} model — model to use
 * @returns {string} shell command
 */
/**
 * Validate model parameter to prevent shell injection.
 * Model IDs should only contain alphanumeric chars, dots, hyphens, underscores, colons, slashes.
 */
function validateModel(model) {
  if (!model) return null;
  const safe = String(model);
  if (!/^[a-zA-Z0-9_.:\-/]+$/.test(safe)) {
    throw new Error(`Invalid model ID: "${safe}" — contains unsafe characters`);
  }
  return safe;
}

const PROVIDER_COMMANDS_HEADLESS = {
  // claude -p: non-interactive mode (print & exit)
  // --output-format text: plain text output
  // --model: sonnet, opus, or full model ID
  claude:   (promptFile, model) => {
    let cmd = `claude -p "$(cat '${promptFile}')" --output-format text --dangerously-skip-permissions`;
    const safeModel = validateModel(model);
    if (safeModel) cmd += ` --model ${safeModel}`;
    return cmd;
  },
  // gemini: positional prompt arg for non-interactive mode (no -p flag)
  // --output-format: text/json/stream-json
  // -m: model selection
  gemini:   (promptFile, model) => {
    let cmd = `gemini --output-format text`;
    const safeModel = validateModel(model);
    if (safeModel) cmd += ` -m ${safeModel}`;
    cmd += ` "$(cat '${promptFile}')"`;
    return cmd;
  },
  // codex exec: non-interactive mode
  // --ephemeral: no session persistence
  // -m: model selection
  codex:    (promptFile, model) => {
    let cmd = `codex exec --ephemeral --skip-git-repo-check`;
    const safeModel = validateModel(model);
    if (safeModel) cmd += ` -m ${safeModel}`;
    cmd += ` "$(cat '${promptFile}')"`;
    return cmd;
  },
  // opencode run: non-interactive mode
  // -m: model as provider/model
  opencode: (promptFile, model) => {
    let cmd = `opencode run`;
    const safeModel = validateModel(model);
    if (safeModel) cmd += ` -m ${safeModel}`;
    cmd += ` "$(cat '${promptFile}')"`;
    return cmd;
  },
};

// Legacy alias
const PROVIDER_COMMANDS = PROVIDER_COMMANDS_TUI;

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
 * @param {string} provider
 * @param {string} task — промпт (ignored in headless mode if promptFile provided)
 * @param {string} cwd
 * @param {object} [opts]
 * @param {boolean} [opts.headless=false] — headless mode (prompt file → stdout → response file)
 * @param {string} [opts.promptFile] — путь к файлу промпта (for headless)
 * @param {string} [opts.responseFile] — файл для записи ответа
 * @param {string} [opts.logFile] — файл для лога stderr
 * @param {string} [opts.model] — модель
 */
function buildProviderCommand(provider, task, cwd, opts = {}) {
  const { headless = false, promptFile, responseFile, logFile, model } = opts;

  if (headless && promptFile && PROVIDER_COMMANDS_HEADLESS[provider]) {
    const builder = PROVIDER_COMMANDS_HEADLESS[provider];
    // Use absolute paths to avoid CWD issues in terminal spawns
    const absPFile = resolvePath(cwd || process.cwd(), promptFile).replace(/\\/g, '/');
    let shellCmd = builder(absPFile, model);

    if (responseFile) {
      const absResp = resolvePath(cwd || process.cwd(), responseFile).replace(/\\/g, '/');
      const absLog = logFile ? resolvePath(cwd || process.cwd(), logFile).replace(/\\/g, '/') : '/dev/null';
      shellCmd = `${shellCmd} > '${absResp}' 2> '${absLog}'`;
    }

    return { shellCmd, cwd, sendTask: null };
  }

  // Legacy TUI mode
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
  const { cwd, headless = false } = opts;
  const results = [];

  for (let i = 0; i < agents.length; i++) {
    const { provider, task, agentId, responseFile, logFile, model } = agents[i];
    const agentCwd = agents[i].cwd || cwd || process.cwd();
    const paneName = agentId || `agent-${i}`;

    // wt: -V = вертикальный, -H = горизонтальный
    const direction = i % 2 === 0 ? '-V' : '-H';

    try {
      const winCwd = agentCwd.replace(/\//g, '\\');
      let fullCmd;

      if (headless && responseFile) {
        // Headless mode: write a temp .ps1 script (PowerShell handles Cyrillic paths)
        const promptFile = agents[i].promptFile;
        if (!promptFile) {
          results.push({ agentId: paneName, provider, status: 'error', error: 'promptFile required for headless mode', terminal: 'wt' });
          continue;
        }

        const absPromptFile = resolvePath(agentCwd, promptFile);
        const absResponseFile = resolvePath(agentCwd, responseFile);
        const absLogFile = logFile ? resolvePath(agentCwd, logFile) : null;

        // Build PowerShell-native headless command per provider
        // Flags match official CLI docs (fetched 2026-03-20)
        const safeModel = model ? validateModel(model) : null;
        let cliPsCmd;
        switch (provider) {
          case 'claude':
            cliPsCmd = `claude -p $prompt --output-format text --dangerously-skip-permissions${safeModel ? ` --model ${safeModel}` : ''}`;
            break;
          case 'gemini':
            // gemini uses positional prompt, --output-format (not -o), -m for model
            cliPsCmd = `gemini --output-format text${safeModel ? ` -m ${safeModel}` : ''} $prompt`;
            break;
          case 'codex':
            cliPsCmd = `codex exec --ephemeral --skip-git-repo-check${safeModel ? ` -m ${safeModel}` : ''} $prompt`;
            break;
          case 'opencode':
            cliPsCmd = `opencode run${safeModel ? ` -m ${safeModel}` : ''} $prompt`;
            break;
          default:
            results.push({ agentId: paneName, provider, status: 'error', error: `No headless command for ${provider}`, terminal: 'wt' });
            continue;
        }

        // Write PowerShell script with UTF-8 output
        const scriptPath = absResponseFile.replace(/\.md$/, '.ps1');
        const logRedirect = absLogFile ? `2>'${absLogFile}'` : '';
        const psScript = [
          '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
          '$OutputEncoding = [System.Text.Encoding]::UTF8',
          `$prompt = Get-Content -Path '${absPromptFile}' -Raw -Encoding UTF8`,
          `${cliPsCmd} ${logRedirect} | Out-File -Encoding UTF8NoBOM -FilePath '${absResponseFile}'`,
        ].join('\n');
        writeFileSync(scriptPath, psScript, 'utf-8');

        fullCmd = `wt -w 0 sp ${direction} -d "${winCwd}" powershell -ExecutionPolicy Bypass -File "${scriptPath}"`;
      } else {
        // TUI mode
        const { shellCmd } = buildProviderCommand(provider, task, agentCwd);
        const escapedCmd = shellCmd.replace(/"/g, '`"');
        fullCmd = `wt -w 0 sp ${direction} -d "${winCwd}" powershell -ExecutionPolicy Bypass -NoExit -Command "${escapedCmd}"`;
      }

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
 * @param {Array<{agentId: string, provider: string, task: string, cwd?: string, responseFile?: string, logFile?: string, model?: string}>} agents
 * @param {object} [opts]
 * @param {'tmux'|'wt'|'wezterm'|'auto'} [opts.terminal='auto'] — терминал
 * @param {string} [opts.cwd] — рабочая директория по умолчанию
 * @param {boolean} [opts.headless=false] — headless mode (prompt → stdout → file)
 * @returns {Promise<{terminal: string, agents: object[]}>}
 */
export async function spawnAgentSplits(agents, opts = {}) {
  const { terminal: requestedTerminal = 'auto', cwd, headless = false } = opts;

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
      results = await spawnTmux(agents, { cwd, headless });
      break;
    case 'wt':
      results = await spawnWt(agents, { cwd, headless });
      break;
    case 'wezterm':
      results = await spawnWezterm(agents, { cwd, headless });
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
