export interface ShellConnectionBudget {
  baseReconnectDelayMs: number;
  maxReconnectDelayMs: number;
  staleAfterMs: number;
  recoveryPollMs: number;
  minRecoveryIntervalMs: number;
}

export const SHELL_CONNECTION_BUDGET: Readonly<ShellConnectionBudget>;

export function getShellReconnectDelay(attempt: unknown, budget?: ShellConnectionBudget): number;
export function isShellSnapshotStale(options?: {
  lastSnapshotAt?: unknown;
  now?: number;
  budget?: ShellConnectionBudget;
}): boolean;
export function shouldRecoverShellSnapshot(options?: {
  lastSnapshotAt?: unknown;
  lastRefreshAt?: unknown;
  now?: number;
  budget?: ShellConnectionBudget;
}): boolean;
