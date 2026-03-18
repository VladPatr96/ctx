import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SHELL_CONNECTION_BUDGET,
  getShellReconnectDelay,
  isShellSnapshotStale,
  shouldRecoverShellSnapshot,
} from '../src/contracts/shell-schemas.js';

test('getShellReconnectDelay uses exponential backoff with cap', () => {
  assert.equal(getShellReconnectDelay(0), 1000);
  assert.equal(getShellReconnectDelay(1), 2000);
  assert.equal(getShellReconnectDelay(5), 30000);
  assert.equal(getShellReconnectDelay('bad'), 1000);
});

test('isShellSnapshotStale becomes true only after the configured stale budget', () => {
  const now = 1_000_000;
  assert.equal(
    isShellSnapshotStale({ lastSnapshotAt: now - SHELL_CONNECTION_BUDGET.staleAfterMs + 1, now }),
    false
  );
  assert.equal(
    isShellSnapshotStale({ lastSnapshotAt: now - SHELL_CONNECTION_BUDGET.staleAfterMs, now }),
    true
  );
  assert.equal(isShellSnapshotStale({ lastSnapshotAt: 0, now }), false);
});

test('shouldRecoverShellSnapshot enforces a minimum recovery interval', () => {
  const now = 1_000_000;
  const lastSnapshotAt = now - SHELL_CONNECTION_BUDGET.staleAfterMs - 100;

  assert.equal(
    shouldRecoverShellSnapshot({ lastSnapshotAt, lastRefreshAt: now - 100, now }),
    false
  );
  assert.equal(
    shouldRecoverShellSnapshot({
      lastSnapshotAt,
      lastRefreshAt: now - SHELL_CONNECTION_BUDGET.minRecoveryIntervalMs,
      now,
    }),
    true
  );
  assert.equal(
    shouldRecoverShellSnapshot({ lastSnapshotAt, lastRefreshAt: 0, now }),
    true
  );
});
