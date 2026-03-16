/**
 * Team Chat Roles — роли агентов, цвета, иконки.
 *
 * Каждый агент в команде имеет роль с уникальным цветом,
 * чтобы визуально отличать участников как в корпоративном чате.
 */

const R = '\x1b[0m';

// ==================== Agent Roles ====================

export const ROLES = {
  // Internal roles (субагенты)
  lead:        { label: 'Lead',        color: '\x1b[36m',  icon: '◆', title: 'Team Lead' },
  architect:   { label: 'Architect',   color: '\x1b[35m',  icon: '△', title: 'Архитектор' },
  reviewer:    { label: 'Reviewer',    color: '\x1b[33m',  icon: '◎', title: 'Ревьюер' },
  tester:      { label: 'Tester',      color: '\x1b[32m',  icon: '✓', title: 'Тестировщик' },
  researcher:  { label: 'Researcher',  color: '\x1b[34m',  icon: '◇', title: 'Исследователь' },
  implementer: { label: 'Implementer', color: '\x1b[37m',  icon: '▸', title: 'Разработчик' },
  documenter:  { label: 'Documenter',  color: '\x1b[90m',  icon: '▪', title: 'Документатор' },

  // External providers (CLI агенты)
  claude:      { label: 'Claude',      color: '\x1b[95m',  icon: 'C', title: 'Claude Code' },
  gemini:      { label: 'Gemini',      color: '\x1b[94m',  icon: 'G', title: 'Gemini CLI' },
  codex:       { label: 'Codex',       color: '\x1b[92m',  icon: 'X', title: 'Codex CLI' },
  opencode:    { label: 'OpenCode',    color: '\x1b[93m',  icon: 'O', title: 'OpenCode CLI' },

  // System
  system:      { label: 'System',      color: '\x1b[2m',   icon: '∗', title: 'Система' },
};

// ==================== Message Types ====================

export const MESSAGE_TYPES = {
  opinion:    { badge: 'МНЕНИЕ',      color: '\x1b[36m',  icon: '💬' },
  delegation: { badge: 'ЗАДАЧА',      color: '\x1b[33m',  icon: '📋' },
  report:     { badge: 'ОТЧЁТ',       color: '\x1b[32m',  icon: '✅' },
  synthesis:  { badge: 'СИНТЕЗ',      color: '\x1b[95m',  icon: '🔮' },
  question:   { badge: 'ВОПРОС',      color: '\x1b[34m',  icon: '❓' },
  agreement:  { badge: 'СОГЛАСИЕ',    color: '\x1b[32m',  icon: '👍' },
  disagreement: { badge: 'НЕСОГЛАСИЕ', color: '\x1b[31m', icon: '👎' },
  progress:   { badge: 'ПРОГРЕСС',    color: '\x1b[33m',  icon: '⏳' },
  done:       { badge: 'ГОТОВО',      color: '\x1b[92m',  icon: '🎯' },
  error:      { badge: 'ОШИБКА',      color: '\x1b[31m',  icon: '❌' },
  system:     { badge: 'СИСТЕМА',     color: '\x1b[2m',   icon: '⚙' },
};

// ==================== Helpers ====================

export function getRole(role) {
  return ROLES[role] || { label: role, color: '\x1b[37m', icon: '?', title: role };
}

export function getMessageType(type) {
  return MESSAGE_TYPES[type] || MESSAGE_TYPES.system;
}
