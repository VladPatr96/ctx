import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SHELL_TAB,
  SHELL_ACTIVE_TAB_STORAGE_KEY,
  SHELL_SHORTCUTS,
  SHELL_TABS,
  SHELL_THEME_STORAGE_KEY,
  buildShellSearch,
  getShellShortcut,
  normalizeShellTab,
  normalizeShellTheme,
  persistShellTab,
  persistShellTheme,
  readStoredShellTab,
  readStoredShellTheme,
  resolveInitialShellTab,
} from '../scripts/contracts/shell-navigation.js';

test('shell tab registry keeps unique ids and includes the default tab', () => {
  const ids = SHELL_TABS.map((tab) => tab.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes(DEFAULT_SHELL_TAB));
});

test('resolveInitialShellTab prefers query tab over stored tab and falls back safely', () => {
  const storage = createMemoryStorage({
    [SHELL_ACTIVE_TAB_STORAGE_KEY]: 'terminal',
  });

  assert.equal(resolveInitialShellTab({ search: '?tab=knowledge', storage }), 'knowledge');
  assert.equal(resolveInitialShellTab({ search: '?tab=unknown', storage }), 'terminal');
  assert.equal(resolveInitialShellTab({ search: '', storage: createMemoryStorage({}) }), 'dashboard');
});

test('buildShellSearch preserves unrelated params and writes canonical tab ids', () => {
  assert.equal(buildShellSearch('?token=abc', 'knowledge'), '?token=abc&tab=knowledge');
  assert.equal(buildShellSearch('?tab=bad&mode=dev', 'terminal'), '?tab=terminal&mode=dev');
  assert.equal(buildShellSearch('', 'invalid-tab'), '?tab=dashboard');
});

test('theme and tab persistence normalize invalid values before writing and reading', () => {
  const storage = createMemoryStorage();

  persistShellTab(storage, 'routing');
  persistShellTheme(storage, 'light');
  assert.equal(storage.data[SHELL_ACTIVE_TAB_STORAGE_KEY], 'routing');
  assert.equal(storage.data[SHELL_THEME_STORAGE_KEY], 'light');
  assert.equal(readStoredShellTab(storage), 'routing');
  assert.equal(readStoredShellTheme(storage), 'light');

  persistShellTab(storage, 'nope');
  persistShellTheme(storage, 'sepia');
  assert.equal(readStoredShellTab(storage), 'dashboard');
  assert.equal(readStoredShellTheme(storage), 'dark');
});

test('shortcut registry is wired to canonical shell tabs', () => {
  assert.deepEqual(getShellShortcut('T'), SHELL_SHORTCUTS.t);
  assert.deepEqual(getShellShortcut('k'), SHELL_SHORTCUTS.k);
  assert.equal(getShellShortcut('x'), null);
  assert.equal(normalizeShellTab('agents'), 'agents');
  assert.equal(normalizeShellTab('bad'), 'dashboard');
  assert.equal(normalizeShellTheme('LIGHT'), 'light');
  assert.equal(normalizeShellTheme('contrast'), 'dark');
});

function createMemoryStorage(initial = {}) {
  const data = { ...initial };
  return {
    data,
    getItem(key) {
      return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
    },
    setItem(key, value) {
      data[key] = String(value);
    },
  };
}
