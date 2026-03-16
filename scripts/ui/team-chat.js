/**
 * Team Chat — терминальный UI для отображения межагентного чата.
 *
 * API:
 *   createChatRoom({ autoScroll }) → chat
 *   chat.post(msg)                — отобразить сообщение { role, agent, type, text }
 *   chat.postSystem(text)         — системное сообщение
 *   chat.postDelegation(role, agent, text, target) — делегирование
 *   chat.postError(role, agent, text)              — ошибка
 *   chat.showTeam(members)        — показать состав команды
 *   chat.separator(text)          — разделитель
 *   chat.getHistory(count)        — последние N сообщений
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

const ROLE_COLORS = {
  lead: MAGENTA,
  advisor: BLUE,
  system: DIM,
  architect: CYAN,
  reviewer: GREEN,
  tester: YELLOW,
};

const PROVIDER_COLORS = {
  claude: MAGENTA,
  gemini: BLUE,
  codex: GREEN,
  opencode: YELLOW,
};

function timestamp() {
  return new Date().toLocaleTimeString('ru-RU', { hour12: false });
}

export function createChatRoom({ autoScroll = true } = {}) {
  const history = [];

  function formatAgent(msg) {
    const color = PROVIDER_COLORS[msg.agent?.toLowerCase()] || ROLE_COLORS[msg.role] || WHITE;
    return `${color}${msg.agent || msg.role || 'unknown'}${RESET}`;
  }

  function formatType(type) {
    switch (type) {
      case 'delegation': return `${YELLOW}[задача]${RESET}`;
      case 'opinion':    return `${CYAN}[мнение]${RESET}`;
      case 'result':     return `${GREEN}[результат]${RESET}`;
      case 'error':      return `${RED}[ошибка]${RESET}`;
      case 'system':     return `${DIM}[система]${RESET}`;
      case 'question':   return `${MAGENTA}[вопрос]${RESET}`;
      default:           return type ? `${DIM}[${type}]${RESET}` : '';
    }
  }

  function printMsg(msg) {
    const time = `${DIM}${timestamp()}${RESET}`;
    const agent = formatAgent(msg);
    const type = formatType(msg.type);
    const text = msg.text || '';

    console.log(`  ${time}  ${agent} ${type}  ${text}`);
  }

  const chat = {
    post(msg) {
      history.push({ ...msg, ts: Date.now() });
      printMsg(msg);
    },

    postSystem(text) {
      chat.post({ role: 'system', agent: 'System', type: 'system', text });
    },

    postDelegation(role, agent, text, target) {
      chat.post({
        role,
        agent,
        type: 'delegation',
        text: `→ ${target}: ${text}`,
      });
    },

    postError(role, agent, text) {
      chat.post({
        role: role || 'system',
        agent: agent || 'System',
        type: 'error',
        text,
      });
    },

    showTeam(members) {
      chat.separator('Команда');
      for (const m of members) {
        const color = PROVIDER_COLORS[m.provider] || ROLE_COLORS[m.role] || WHITE;
        const role = m.role ? ` ${DIM}(${m.role})${RESET}` : '';
        console.log(`  ${GREEN}●${RESET} ${color}${m.name}${RESET}${role}`);
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
