export const SHELL_CONNECTION_BUDGET = Object.freeze({
  baseReconnectDelayMs: 1000,
  maxReconnectDelayMs: 30000,
  staleAfterMs: 15000,
  recoveryPollMs: 5000,
  minRecoveryIntervalMs: 3000,
});

export function getShellReconnectDelay(attempt, budget = SHELL_CONNECTION_BUDGET) {
  const normalizedAttempt = normalizeAttempt(attempt);
  return Math.min(
    budget.baseReconnectDelayMs * Math.pow(2, normalizedAttempt),
    budget.maxReconnectDelayMs
  );
}

export function isShellSnapshotStale({ lastSnapshotAt, now = Date.now(), budget = SHELL_CONNECTION_BUDGET } = {}) {
  const snapshotAt = normalizeTimestamp(lastSnapshotAt);
  if (!snapshotAt) return false;
  return now - snapshotAt >= budget.staleAfterMs;
}

export function shouldRecoverShellSnapshot({
  lastSnapshotAt,
  lastRefreshAt,
  now = Date.now(),
  budget = SHELL_CONNECTION_BUDGET,
} = {}) {
  if (!isShellSnapshotStale({ lastSnapshotAt, now, budget })) {
    return false;
  }

  const refreshAt = normalizeTimestamp(lastRefreshAt);
  if (!refreshAt) {
    return true;
  }

  return now - refreshAt >= budget.minRecoveryIntervalMs;
}

function normalizeAttempt(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

function normalizeTimestamp(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}
