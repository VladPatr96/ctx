/**
 * Team Chat — терминальный UI для межагентного чата.
 *
 * Фичи:
 *   - Провайдерские иконки с цветами (◈ Claude, ◇ Gemini, ▣ Codex, ● OpenCode)
 *   - Lead badge (★)
 *   - Response boxes для результатов
 *   - Статус-трекинг агентов
 *   - Synthesis box для консолидации
 */

const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const CYAN = '\x1b[36m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const MAGENTA = '\x1b[35m';
const BLUE = '\x1b[34m';
const WHITE = '\x1b[37m';

// ==================== Provider visuals ====================

const PROVIDER_ICONS = {
  claude:   { icon: '◈', color: '\x1b[95m', name: 'Claude Code' },
  gemini:   { icon: '◇', color: '\x1b[94m', name: 'Gemini CLI' },
  codex:    { icon: '▣', color: '\x1b[92m', name: 'Codex CLI' },
  opencode: { icon: '●', color: '\x1b[93m', name: 'OpenCode CLI' },
};

const STATUS_ICONS = {
  queued:   `${DIM}○${RESET}`,
  working:  `${YELLOW}◉${RESET}`,
  done:     `${GREEN}✓${RESET}`,
  error:    `${RED}✗${RESET}`,
};

const TYPE_LABELS = {
  delegation: `${YELLOW}ЗАДАЧА${RESET}`,
  opinion:    `${CYAN}мнение${RESET}`,
  report:     `${GREEN}ОТВЕТ${RESET}`,
  result:     `${GREEN}ОТВЕТ${RESET}`,
  done:       `${GREEN}готово${RESET}`,
  error:      `${RED}ошибка${RESET}`,
  synthesis:  `${MAGENTA}СИНТЕЗ${RESET}`,
  system:     `${DIM}система${RESET}`,
  question:   `${MAGENTA}вопрос${RESET}`,
  progress:   `${DIM}прогресс${RESET}`,
};

function timestamp() {
  return new Date().toLocaleTimeString('ru-RU', { hour12: false });
}

function getProviderVisual(msg) {
  const id = (msg.role || msg.agent || '').toLowerCase();
  return PROVIDER_ICONS[id] || null;
}

// ==================== Chat room ====================

export function createChatRoom({ autoScroll = true, leadId = null } = {}) {
  const history = [];
  const agentStatuses = new Map(); // id → { state, elapsed, name }

  // ── Agent header ──
  function formatAgent(msg) {
    const pv = getProviderVisual(msg);
    if (pv) {
      const isLead = leadId && (msg.role === leadId || msg.agent?.toLowerCase() === leadId);
      const lead = isLead ? ` ${BOLD}★${RESET}` : '';
      return `${pv.color}${pv.icon}${RESET}  ${BOLD}${msg.agent || pv.name}${RESET}${lead}`;
    }
    // Non-provider (User, System)
    const agent = msg.agent || msg.role || 'unknown';
    if (agent === 'User') return `${CYAN}▸${RESET}  ${BOLD}User${RESET}`;
    if (agent === 'System' || msg.role === 'system') return `${DIM}⚙${RESET}  ${DIM}System${RESET}`;
    return `   ${msg.agent || msg.role}`;
  }

  function formatType(type) {
    return TYPE_LABELS[type] || (type ? `${DIM}${type}${RESET}` : '');
  }

  // ── Simple message ──
  function printMsg(msg) {
    const time = `${DIM}${timestamp()}${RESET}`;
    const agent = formatAgent(msg);
    const type = formatType(msg.type);

    console.log(`  ${time}  ${agent}  ${type}`);

    // Short messages inline
    if (msg.text && msg.text.length < 100 && !msg.text.includes('\n')) {
      console.log(`           ${msg.text}`);
    }
    console.log();
  }

  // ── Response box (for reports/results) ──
  function printResponseBox(msg) {
    const pv = getProviderVisual(msg);
    const color = pv?.color || WHITE;
    const isLead = leadId && (msg.role === leadId);
    const lead = isLead ? ` ★ Lead` : '';
    const name = msg.agent || pv?.name || msg.role;
    const typeLabel = formatType(msg.type);

    const width = Math.min(process.stdout.columns || 80, 80) - 4;
    const line = '─'.repeat(width);

    console.log();
    console.log(`  ${color}┌─ ${pv?.icon || '○'} ${BOLD}${name}${RESET}${lead} ${typeLabel} ${color}${'─'.repeat(Math.max(0, width - name.length - 15))}┐${RESET}`);
    console.log(`  ${color}│${RESET}`);

    // Word-wrap text
    const lines = (msg.text || '').split('\n');
    for (const rawLine of lines) {
      if (rawLine.length <= width - 4) {
        console.log(`  ${color}│${RESET}  ${rawLine}`);
      } else {
        // Simple word wrap
        const words = rawLine.split(' ');
        let current = '';
        for (const word of words) {
          if (current.length + word.length + 1 > width - 4) {
            console.log(`  ${color}│${RESET}  ${current}`);
            current = word;
          } else {
            current += (current ? ' ' : '') + word;
          }
        }
        if (current) console.log(`  ${color}│${RESET}  ${current}`);
      }
    }

    console.log(`  ${color}│${RESET}`);
    console.log(`  ${color}└${line}┘${RESET}`);
    console.log();
  }

  // ── Synthesis box (double border, for lead consolidation) ──
  function printSynthesisBox(msg) {
    const pv = getProviderVisual(msg) || PROVIDER_ICONS.claude;
    const color = pv.color;
    const name = msg.agent || pv.name;
    const width = Math.min(process.stdout.columns || 80, 80) - 4;
    const dline = '═'.repeat(width);

    console.log();
    console.log(`  ${color}╔─ ★ ${BOLD}СИНТЕЗ: ${name}${RESET} ${color}${'═'.repeat(Math.max(0, width - name.length - 14))}╗${RESET}`);
    console.log(`  ${color}║${RESET}`);

    const lines = (msg.text || '').split('\n');
    for (const line of lines) {
      if (line.length <= width - 4) {
        console.log(`  ${color}║${RESET}  ${line}`);
      } else {
        const words = line.split(' ');
        let current = '';
        for (const word of words) {
          if (current.length + word.length + 1 > width - 4) {
            console.log(`  ${color}║${RESET}  ${current}`);
            current = word;
          } else {
            current += (current ? ' ' : '') + word;
          }
        }
        if (current) console.log(`  ${color}║${RESET}  ${current}`);
      }
    }

    console.log(`  ${color}║${RESET}`);
    console.log(`  ${color}╚${dline}╝${RESET}`);
    console.log();
  }

  // ── Status dashboard ──
  function printStatusDashboard() {
    if (agentStatuses.size === 0) return;

    const width = Math.min(process.stdout.columns || 80, 60);
    const line = '─'.repeat(width);

    console.log(`  ${DIM}${line}${RESET}`);
    for (const [id, status] of agentStatuses) {
      const pv = PROVIDER_ICONS[id] || { icon: '○', color: WHITE };
      const isLead = id === leadId;
      const lead = isLead ? `${BOLD}★${RESET} ` : '  ';
      const stIcon = STATUS_ICONS[status.state] || STATUS_ICONS.queued;
      const elapsed = status.elapsed ? `${DIM}${status.elapsed}s${RESET}` : '';
      const name = (status.name || pv.name || id).padEnd(16);

      console.log(`  ${lead}${pv.color}${pv.icon}${RESET}  ${name} ${stIcon} ${status.state.padEnd(8)} ${elapsed}`);
    }
    console.log(`  ${DIM}${line}${RESET}`);
    console.log();
  }

  // ==================== Public API ====================

  const chat = {
    post(msg) {
      history.push({ ...msg, ts: Date.now() });

      // Route to appropriate renderer
      if (msg.type === 'report' || msg.type === 'result') {
        printResponseBox(msg);
      } else if (msg.type === 'synthesis') {
        printSynthesisBox(msg);
      } else {
        printMsg(msg);
      }
    },

    postSystem(text) {
      chat.post({ role: 'system', agent: 'System', type: 'system', text });
    },

    postDelegation(role, agent, text, target) {
      chat.post({ role, agent, type: 'delegation', text: `→ ${target}: ${text}` });
    },

    postError(role, agent, text) {
      chat.post({ role: role || 'system', agent: agent || 'System', type: 'error', text });
    },

    // Update agent status (for dashboard)
    updateStatus(id, state, elapsed = null) {
      const existing = agentStatuses.get(id) || {};
      agentStatuses.set(id, { ...existing, state, elapsed: elapsed || existing.elapsed });
    },

    // Register agent for status tracking
    registerAgent(id, name) {
      agentStatuses.set(id, { name, state: 'queued', elapsed: null });
    },

    showStatusDashboard() {
      printStatusDashboard();
    },

    showTeam(members) {
      chat.separator('Команда');
      for (const m of members) {
        const pv = PROVIDER_ICONS[m.provider] || { icon: '○', color: WHITE };
        const isLead = m.role === 'lead';
        const lead = isLead ? ` ${BOLD}★ Lead${RESET}` : '';
        const role = m.role && m.role !== 'lead' ? ` ${DIM}(${m.role})${RESET}` : '';
        console.log(`  ${pv.color}${pv.icon}${RESET}  ${BOLD}${m.name}${RESET}${lead}${role}`);
      }
      console.log();
    },

    separator(text) {
      const line = '─'.repeat(40);
      console.log(`\n  ${DIM}${line}${RESET} ${BOLD}${text}${RESET} ${DIM}${line}${RESET}\n`);
    },

    getHistory(count = 20) {
      return history.slice(-count);
    },
  };

  return chat;
}
