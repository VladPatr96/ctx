/** @typedef {'command' | 'dashboard' | 'knowledge' | 'agents' | 'routing' | 'devpipeline' | 'orchestrator' | 'debates' | 'settings' | 'terminal'} ShellTabId */
/** @typedef {'dark' | 'light'} ShellTheme */
/** @typedef {{ id: ShellTabId, label: string, icon: string, focusTargetId?: string }} ShellTab */
/** @typedef {{ tab: ShellTabId, focusTargetId?: string }} ShellShortcut */
/** @typedef {{ getItem?: (key: string) => string | null, setItem?: (key: string, value: string) => void }} StorageLike */

export const DEFAULT_SHELL_TAB = 'command';
export const DEFAULT_SHELL_THEME = 'dark';
export const SHELL_ACTIVE_TAB_STORAGE_KEY = 'ctx-active-tab';
export const SHELL_THEME_STORAGE_KEY = 'ctx-theme';

/** @type {ReadonlyArray<ShellTab>} */
export const SHELL_TABS = Object.freeze([
  { id: 'command', label: 'Command Center', icon: 'command', focusTargetId: 'cmd-input' },
  { id: 'dashboard', label: 'Pipeline', icon: 'layout-dashboard', focusTargetId: 'task-input' },
  { id: 'knowledge', label: 'Knowledge', icon: 'book-open', focusTargetId: 'kb-search-input' },
  { id: 'agents', label: 'Agents', icon: 'users' },
  { id: 'routing', label: 'Routing', icon: 'git-branch' },
  { id: 'devpipeline', label: 'Dev Pipeline', icon: 'workflow' },
  { id: 'orchestrator', label: 'Orchestrator', icon: 'bot' },
  { id: 'debates', label: 'Debates', icon: 'message-square-more' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
  { id: 'terminal', label: 'Terminal', icon: 'terminal' },
]);

/** @type {Readonly<Record<string, ShellShortcut>>} */
export const SHELL_SHORTCUTS = Object.freeze({
  c: Object.freeze({ tab: 'command', focusTargetId: 'cmd-input' }),
  t: Object.freeze({ tab: 'dashboard', focusTargetId: 'task-input' }),
  k: Object.freeze({ tab: 'knowledge', focusTargetId: 'kb-search-input' }),
});

const SHELL_TAB_SET = new Set(SHELL_TABS.map((tab) => tab.id));
const SHELL_THEME_SET = new Set(['dark', 'light']);

export function isShellTab(value) {
  return typeof value === 'string' && SHELL_TAB_SET.has(value);
}

export function normalizeShellTab(value, fallback = DEFAULT_SHELL_TAB) {
  return isShellTab(value) ? value : fallback;
}

export function getShellShortcut(key) {
  if (typeof key !== 'string') return null;
  return SHELL_SHORTCUTS[key.trim().toLowerCase()] || null;
}

export function normalizeShellTheme(value, fallback = DEFAULT_SHELL_THEME) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  return SHELL_THEME_SET.has(normalized) ? normalized : fallback;
}

export function readStoredShellTab(storage) {
  return normalizeShellTab(readStorageValue(storage, SHELL_ACTIVE_TAB_STORAGE_KEY));
}

export function readStoredShellTheme(storage) {
  return normalizeShellTheme(readStorageValue(storage, SHELL_THEME_STORAGE_KEY));
}

export function resolveInitialShellTab({ search = '', storage } = {}) {
  const params = new URLSearchParams(normalizeSearch(search));
  const queryTab = params.get('tab');
  if (isShellTab(queryTab)) {
    return queryTab;
  }
  return readStoredShellTab(storage);
}

export function buildShellSearch(search = '', activeTab = DEFAULT_SHELL_TAB) {
  const params = new URLSearchParams(normalizeSearch(search));
  params.set('tab', normalizeShellTab(activeTab));
  const next = params.toString();
  return next ? `?${next}` : '';
}

export function persistShellTab(storage, activeTab) {
  writeStorageValue(storage, SHELL_ACTIVE_TAB_STORAGE_KEY, normalizeShellTab(activeTab));
}

export function persistShellTheme(storage, theme) {
  writeStorageValue(storage, SHELL_THEME_STORAGE_KEY, normalizeShellTheme(theme));
}

function readStorageValue(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function writeStorageValue(storage, key, value) {
  try {
    storage?.setItem?.(key, value);
  } catch {
    // Ignore storage failures; shell state can still work in-memory.
  }
}

function normalizeSearch(search) {
  if (typeof search !== 'string') return '';
  return search.startsWith('?') ? search.slice(1) : search;
}
