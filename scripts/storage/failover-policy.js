const POLICY_STATES = Object.freeze([
  'sqlite_primary',
  'json_rollback',
  'recovery_probe'
]);

const POLICY_OVERRIDES = Object.freeze([
  'auto',
  'sqlite_primary',
  'json_rollback'
]);

function noop() {}

export class FailoverPolicy {
  constructor(options = {}) {
    this.enabled = options.enabled === true;
    this.override = normalizeOverride(options.override, 'auto');
    this.onTransition = typeof options.onTransition === 'function' ? options.onTransition : noop;
    this.now = typeof options.now === 'function' ? options.now : Date.now;

    this.triggerFailureRatio = normalizeRatio(options.triggerFailureRatio, 0.3);
    this.triggerMinFailures = normalizePositiveInt(options.triggerMinFailures, 3);
    this.triggerMinOperations = normalizePositiveInt(options.triggerMinOperations, 6);
    this.probeSuccessesRequired = normalizePositiveInt(options.probeSuccessesRequired, 2);
    this.rollbackMinMs = normalizePositiveInt(options.rollbackMinMs, 30000);
    this.probeIntervalMs = normalizePositiveInt(options.probeIntervalMs, 15000);

    const now = this.now();
    this.state = 'sqlite_primary';
    this.enteredAt = now;
    this.lastRollbackAt = 0;
    this.lastProbeAt = 0;
    this.probeSuccesses = 0;
    this.transitionCount = 0;
  }

  beforeOperation(metrics) {
    if (!this.enabled || this.override !== 'auto') {
      return this.getEffectiveState();
    }

    if (this.state === 'json_rollback' && this.shouldStartProbe()) {
      this.transition('recovery_probe', {
        reason: 'probe_interval_elapsed',
        failures: metrics.failures,
        failureRatio: metrics.failureRatio
      });
    }

    return this.state;
  }

  recordPrimarySuccess() {
    if (!this.enabled || this.override !== 'auto') return;

    if (this.state === 'recovery_probe') {
      this.probeSuccesses += 1;
      if (this.probeSuccesses >= this.probeSuccessesRequired) {
        this.transition('sqlite_primary', {
          reason: 'probe_success',
          probeSuccesses: this.probeSuccesses
        });
      }
      return;
    }
  }

  recordPrimaryFailure(metrics) {
    if (!this.enabled || this.override !== 'auto') return;

    if (this.state === 'recovery_probe') {
      this.transition('json_rollback', {
        reason: 'probe_failed',
        failures: metrics.failures,
        failureRatio: metrics.failureRatio
      });
      return;
    }

    if (this.state !== 'sqlite_primary') return;

    if (this.shouldEnterRollback(metrics)) {
      this.transition('json_rollback', {
        reason: 'degraded_primary',
        failures: metrics.failures,
        failureRatio: metrics.failureRatio
      });
    }
  }

  getEffectiveState() {
    if (!this.enabled) return 'sqlite_primary';
    if (this.override === 'sqlite_primary') return 'sqlite_primary';
    if (this.override === 'json_rollback') return 'json_rollback';
    return this.state;
  }

  getSnapshot() {
    return {
      enabled: this.enabled,
      override: this.override,
      state: this.getEffectiveState(),
      internalState: this.state,
      transitionCount: this.transitionCount,
      enteredAt: toIso(this.enteredAt),
      lastRollbackAt: toIso(this.lastRollbackAt),
      lastProbeAt: toIso(this.lastProbeAt),
      probeSuccesses: this.probeSuccesses,
      thresholds: {
        triggerFailureRatio: this.triggerFailureRatio,
        triggerMinFailures: this.triggerMinFailures,
        triggerMinOperations: this.triggerMinOperations,
        probeSuccessesRequired: this.probeSuccessesRequired
      },
      timers: {
        rollbackMinMs: this.rollbackMinMs,
        probeIntervalMs: this.probeIntervalMs
      }
    };
  }

  shouldEnterRollback(metrics) {
    return (
      metrics.failures >= this.triggerMinFailures &&
      metrics.operations >= this.triggerMinOperations &&
      metrics.failureRatio >= this.triggerFailureRatio
    );
  }

  shouldStartProbe() {
    const now = this.now();
    if (now - this.lastRollbackAt < this.rollbackMinMs) return false;
    if (now - this.lastProbeAt < this.probeIntervalMs) return false;
    return true;
  }

  transition(nextState, metadata = {}) {
    if (!POLICY_STATES.includes(nextState)) return;
    if (this.state === nextState) return;

    const now = this.now();
    const prev = this.state;
    this.state = nextState;
    this.enteredAt = now;
    this.transitionCount += 1;

    if (nextState === 'json_rollback') {
      this.lastRollbackAt = now;
      this.probeSuccesses = 0;
    } else if (nextState === 'recovery_probe') {
      this.lastProbeAt = now;
      this.probeSuccesses = 0;
    } else if (nextState === 'sqlite_primary') {
      this.probeSuccesses = 0;
    }

    this.onTransition({
      ts: new Date(now).toISOString(),
      from: prev,
      to: nextState,
      ...metadata
    });
  }
}

function normalizeOverride(value, fallback) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return POLICY_OVERRIDES.includes(normalized) ? normalized : fallback;
}

function normalizeRatio(value, fallback) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1) return fallback;
  return normalized;
}

function normalizePositiveInt(value, fallback) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return fallback;
  return Math.max(1, Math.floor(normalized));
}

function toIso(value) {
  if (!value) return null;
  return new Date(value).toISOString();
}

