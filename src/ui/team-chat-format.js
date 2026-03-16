/**
 * Team Chat Format — форматирование сообщений для терминала.
 *
 * Чистые функции без side effects. Каждое сообщение выглядит как строка
 * в корпоративном чате: время, роль с цветом, тип, текст.
 */

import { getRole, getMessageType } from './team-chat-roles.js';

const R = '\x1b[0m';
const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';

// ==================== Core formatters ====================

export function formatTimestamp(isoString) {
  const d = new Date(isoString);
  return [d.getHours(), d.getMinutes(), d.getSeconds()]
    .map(n => String(n).padStart(2, '0'))
    .join(':');
}

export function formatRole(role, agentName) {
  const r = getRole(role);
  const name = agentName ? `: ${agentName}` : '';
  return `${r.color}${BOLD}${r.icon} ${r.label}${name}${R}`;
}

export function formatBadge(type) {
  const t = getMessageType(type);
  return `${t.color}[${t.badge}]${R}`;
}

export function stripAnsi(str) {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

// ==================== Message line formatting ====================

/**
 * Форматирует сообщение в строку чата.
 *
 * Формат:
 *   14:23:05  ◆ Lead: Coordinator  [МНЕНИЕ]  Текст сообщения...
 *
 * Для многострочных — продолжение с отступом.
 */
export function formatChatLine(message, opts = {}) {
  const { maxWidth = 120 } = opts;

  const time = `${DIM}${formatTimestamp(message.timestamp)}${R}`;
  const role = formatRole(message.role, message.agent);
  const badge = formatBadge(message.type);

  const prefix = `${time}  ${role}  ${badge}  `;
  const prefixLen = stripAnsi(prefix).length;
  const indent = ' '.repeat(prefixLen);

  const bodyWidth = Math.max(30, maxWidth - prefixLen);
  const lines = wrapText(message.text, bodyWidth);

  if (lines.length === 0) return prefix;

  const firstLine = `${prefix}${lines[0]}`;
  if (lines.length === 1) return firstLine;

  const rest = lines.slice(1).map(l => `${indent}${l}`).join('\n');
  return `${firstLine}\n${rest}`;
}

/**
 * Форматирует synthesis-сообщение в рамке.
 */
export function formatSynthesisBox(message, opts = {}) {
  const { maxWidth = 120 } = opts;

  const time = `${DIM}${formatTimestamp(message.timestamp)}${R}`;
  const role = formatRole(message.role, message.agent);
  const badge = formatBadge(message.type);
  const header = `${time}  ${role}  ${badge}`;

  const boxWidth = Math.min(80, maxWidth - 10);
  const innerWidth = boxWidth - 4;
  const lines = wrapText(message.text, innerWidth);

  const top    = `  ${DIM}╔${'═'.repeat(boxWidth - 2)}╗${R}`;
  const bottom = `  ${DIM}╚${'═'.repeat(boxWidth - 2)}╝${R}`;

  const body = lines.map(l => {
    const pad = innerWidth - stripAnsi(l).length;
    return `  ${DIM}║${R} ${l}${' '.repeat(Math.max(0, pad))} ${DIM}║${R}`;
  }).join('\n');

  return `${header}\n${top}\n${body}\n${bottom}`;
}

// ==================== Separators ====================

export function formatSeparator(label, opts = {}) {
  const { maxWidth = 120 } = opts;
  const lineLen = Math.min(80, maxWidth);

  if (!label) {
    return `  ${DIM}${'─'.repeat(lineLen)}${R}`;
  }

  const padded = ` ${label} `;
  const sideLen = Math.max(3, Math.floor((lineLen - padded.length) / 2));
  const left = '─'.repeat(sideLen);
  const right = '─'.repeat(lineLen - sideLen - padded.length);

  return `  ${DIM}${left}${R}${BOLD} ${label} ${R}${DIM}${right}${R}`;
}

// ==================== Delegation formatting ====================

export function formatDelegation(message) {
  const r = getRole(message.role);
  const meta = message.metadata || {};
  const target = meta.target ? `→ ${getRole(meta.target).color}${BOLD}${meta.target}${R}` : '';
  const task = meta.task || message.text;

  return formatChatLine({
    ...message,
    text: `${target}  ${task}`,
  });
}

// ==================== Team roster ====================

/**
 * Формирует блок "Состав команды" для начала сессии.
 */
export function formatTeamRoster(members) {
  const header = `${BOLD}  Состав команды:${R}`;
  const lines = members.map(m => {
    const r = getRole(m.role);
    const provider = m.provider ? ` ${DIM}(${m.provider})${R}` : '';
    return `  ${r.color}${r.icon} ${BOLD}${m.name}${R} — ${DIM}${r.title}${R}${provider}`;
  });

  const separator = `  ${DIM}${'─'.repeat(50)}${R}`;

  return `${separator}\n${header}\n${lines.join('\n')}\n${separator}`;
}

// ==================== Text utilities ====================

export function wrapText(text, maxWidth) {
  if (!text) return [];

  const result = [];
  const paragraphs = text.split('\n');

  for (const para of paragraphs) {
    if (stripAnsi(para).length <= maxWidth) {
      result.push(para);
      continue;
    }

    const words = para.split(/(\s+)/);
    let current = '';

    for (const word of words) {
      const testLen = stripAnsi(current + word).length;
      if (testLen > maxWidth && current.length > 0) {
        result.push(current.trimEnd());
        current = word.trimStart();
      } else {
        current += word;
      }
    }
    if (current.trim()) result.push(current.trimEnd());
  }

  return result;
}
