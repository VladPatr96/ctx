export type ShellTabId =
  | 'dashboard'
  | 'knowledge'
  | 'agents'
  | 'routing'
  | 'devpipeline'
  | 'orchestrator'
  | 'debates'
  | 'settings'
  | 'terminal';

export type ShellTheme = 'dark' | 'light';

export interface ShellTab {
  id: ShellTabId;
  label: string;
  icon: string;
  focusTargetId?: string;
}

export interface ShellShortcut {
  tab: ShellTabId;
  focusTargetId?: string;
}

export interface StorageLike {
  getItem?: (key: string) => string | null;
  setItem?: (key: string, value: string) => void;
}

export const DEFAULT_SHELL_TAB: ShellTabId;
export const DEFAULT_SHELL_THEME: ShellTheme;
export const SHELL_ACTIVE_TAB_STORAGE_KEY: string;
export const SHELL_THEME_STORAGE_KEY: string;
export const SHELL_TABS: ReadonlyArray<ShellTab>;
export const SHELL_SHORTCUTS: Readonly<Record<string, ShellShortcut>>;

export function isShellTab(value: unknown): value is ShellTabId;
export function normalizeShellTab(value: unknown, fallback?: ShellTabId): ShellTabId;
export function getShellShortcut(key: string): ShellShortcut | null;
export function normalizeShellTheme(value: unknown, fallback?: ShellTheme): ShellTheme;
export function readStoredShellTab(storage: StorageLike | null | undefined): ShellTabId;
export function readStoredShellTheme(storage: StorageLike | null | undefined): ShellTheme;
export function resolveInitialShellTab(options?: {
  search?: string;
  storage?: StorageLike | null | undefined;
}): ShellTabId;
export function buildShellSearch(search?: string, activeTab?: ShellTabId): string;
export function persistShellTab(storage: StorageLike | null | undefined, activeTab: ShellTabId): void;
export function persistShellTheme(storage: StorageLike | null | undefined, theme: ShellTheme): void;
