import { StorageAdapter } from './storage-adapter.js';
import { FailoverPolicy } from './failover-policy.js';

const PRIMARY_MISS = Symbol('primary_miss');

function noop() {}

export class FailoverStore extends StorageAdapter {
  constructor(options = {}) {
    super();
    if (!options.primary) {
      throw new Error('FailoverStore requires a primary adapter');
    }
    if (!options.backup) {
      throw new Error('FailoverStore requires a backup adapter');
    }
    this.primary = options.primary;
    this.backup = options.backup;
    this.warn = typeof options.onWarning === 'function' ? options.onWarning : noop;
    this.enableFallback = options.enableFallback !== false;
    this.warningRatioThreshold = normalizeRatio(options.warningRatioThreshold, 0.3);
    this.warningMinFailures = normalizeMinFailures(options.warningMinFailures, 3);
    this.policy = new FailoverPolicy({
      enabled: options.autoRollbackPolicy === true,
      override: options.policyOverride,
      triggerFailureRatio: normalizeRatio(
        options.policyTriggerFailureRatio,
        this.warningRatioThreshold
      ),
      triggerMinFailures: normalizeMinFailures(
        options.policyTriggerMinFailures,
        this.warningMinFailures
      ),
      triggerMinOperations: normalizeMinFailures(
        options.policyTriggerMinOperations,
        Math.max(this.warningMinFailures * 2, 6)
      ),
      probeSuccessesRequired: normalizeMinFailures(options.policyProbeSuccesses, 2),
      rollbackMinMs: normalizePositiveInt(options.policyRollbackMinMs, 30000),
      probeIntervalMs: normalizePositiveInt(options.policyProbeIntervalMs, 15000),
      now: options.policyNow,
      onTransition: (event) => this.handlePolicyTransition(event)
    });
    this.inRollbackMode = this.isRollbackState(this.policy.getEffectiveState());
    this.warningActive = false;
    this.stats = {
      sqlite_primary_ok: 0,
      sqlite_primary_fail: 0,
      rollback_to_json: 0,
      rollback_recoveries: 0,
      policy_transitions: 0,
      policy_forced_json_ops: 0,
      policy_probe_attempts: 0,
      policy_probe_success: 0,
      policy_probe_fail: 0
    };
  }

  getFailoverStats() {
    return { ...this.stats };
  }

  getHealthSnapshot() {
    const metrics = this.getMetrics();

    return {
      mode: 'sqlite-primary',
      effectiveMode: this.inRollbackMode ? 'json-backup' : 'sqlite-primary',
      failoverEnabled: this.enableFallback,
      inRollbackMode: this.inRollbackMode,
      warningActive: metrics.warningActive,
      policyState: this.policy.getEffectiveState(),
      thresholds: {
        failureRatio: this.warningRatioThreshold,
        minFailures: this.warningMinFailures
      },
      totals: {
        operations: metrics.operations,
        failures: metrics.failures,
        successes: metrics.successes,
        failureRatio: Number(metrics.failureRatio.toFixed(4))
      },
      policy: this.policy.getSnapshot(),
      counters: { ...this.stats }
    };
  }

  readPipeline(fallbackValue) {
    const route = this.getRouteMode();
    if (route === 'json_rollback') {
      return this.runBackupOnly('readPipeline', () => this.backup.readPipeline(fallbackValue));
    }

    try {
      const value = this.primary.readPipeline(PRIMARY_MISS);
      if (value === PRIMARY_MISS) {
        throw new Error('sqlite primary returned empty payload');
      }
      this.markPrimarySuccess();
      return value;
    } catch (err) {
      return this.runFallback(
        'readPipeline',
        err,
        () => this.backup.readPipeline(fallbackValue)
      );
    }
  }

  readLog(limit = 50) {
    const route = this.getRouteMode();
    if (route === 'json_rollback') {
      return this.runBackupOnly('readLog', () => this.backup.readLog(limit));
    }

    try {
      const value = this.primary.readLog(limit);
      this.markPrimarySuccess();
      return value;
    } catch (err) {
      return this.runFallback(
        'readLog',
        err,
        () => this.backup.readLog(limit)
      );
    }
  }

  writePipeline(pipeline) {
    const route = this.getRouteMode();
    if (route === 'json_rollback') {
      this.runBackupOnly('writePipeline', () => this.backup.writePipeline(pipeline));
      return;
    }

    try {
      this.primary.writePipeline(pipeline);
      this.markPrimarySuccess();
    } catch (err) {
      this.runFallback(
        'writePipeline',
        err,
        () => this.backup.writePipeline(pipeline)
      );
      return;
    }

    this.syncBackup('writePipeline', () => this.backup.writePipeline(pipeline));
  }

  appendLog(entry) {
    const route = this.getRouteMode();
    if (route === 'json_rollback') {
      this.runBackupOnly('appendLog', () => this.backup.appendLog(entry));
      return;
    }

    try {
      this.primary.appendLog(entry);
      this.markPrimarySuccess();
    } catch (err) {
      this.runFallback(
        'appendLog',
        err,
        () => this.backup.appendLog(entry)
      );
      return;
    }

    this.syncBackup('appendLog', () => this.backup.appendLog(entry));
  }

  clearLog() {
    const route = this.getRouteMode();
    if (route === 'json_rollback') {
      this.runBackupOnly('clearLog', () => this.backup.clearLog(), { logFailure: false });
      return;
    }

    try {
      this.primary.clearLog();
      this.markPrimarySuccess();
    } catch (err) {
      this.runFallback(
        'clearLog',
        err,
        () => this.backup.clearLog(),
        { logFallbackEvent: false }
      );
      return;
    }

    this.syncBackup('clearLog', () => this.backup.clearLog(), { logSyncFailure: false });
  }

  close() {
    if (typeof this.primary.close === 'function') {
      this.primary.close();
    }
    if (this.backup !== this.primary && typeof this.backup.close === 'function') {
      this.backup.close();
    }
  }

  markPrimarySuccess() {
    const wasRollbackMode = this.inRollbackMode;
    const beforeState = this.policy.getEffectiveState();
    this.stats.sqlite_primary_ok += 1;
    this.updateWarningState();
    this.policy.recordPrimarySuccess();
    const afterState = this.policy.getEffectiveState();

    if (beforeState === 'recovery_probe') {
      this.stats.policy_probe_success += 1;
    }

    this.inRollbackMode = this.isRollbackState(afterState);
    if (wasRollbackMode && !this.inRollbackMode) {
      this.stats.rollback_recoveries += 1;
    }
  }

  runFallback(operation, primaryErr, fallbackFn, options = {}) {
    const beforeState = this.policy.getEffectiveState();
    this.stats.sqlite_primary_fail += 1;
    this.updateWarningState();
    this.policy.recordPrimaryFailure(this.getMetrics());
    const afterState = this.policy.getEffectiveState();
    if (beforeState === 'recovery_probe') {
      this.stats.policy_probe_fail += 1;
    }

    if (!this.enableFallback) {
      throw new Error(`SQLite primary failed during ${operation}: ${primaryErr.message}`);
    }

    this.warn(`SQLite primary failed during ${operation}: ${primaryErr.message}. Falling back to JSON backup.`);
    try {
      const result = fallbackFn();
      this.inRollbackMode = true;
      this.stats.rollback_to_json += 1;
      if (options.logFallbackEvent !== false) {
        this.logBackup({
          action: 'sqlite_primary_failover',
          message: 'SQLite primary failed; JSON backup used',
          operation,
          error: primaryErr.message
        });
      }
      return result;
    } catch (backupErr) {
      this.logBackup({
        action: 'sqlite_primary_double_fail',
        message: 'SQLite primary and JSON backup failed',
        operation,
        error: backupErr.message
      });
      throw new Error(`SQLite primary and JSON backup failed during ${operation}: ${backupErr.message}`);
    }
  }

  runBackupOnly(operation, backupFn, options = {}) {
    if (!this.enableFallback) {
      throw new Error(`JSON rollback path is disabled during ${operation}`);
    }

    this.stats.policy_forced_json_ops += 1;
    this.inRollbackMode = true;

    try {
      return backupFn();
    } catch (err) {
      if (options.logFailure !== false) {
        this.logBackup({
          action: 'sqlite_policy_json_fail',
          message: 'JSON rollback operation failed',
          operation,
          error: err.message
        });
      }
      throw new Error(`JSON backup failed during ${operation}: ${err.message}`);
    }
  }

  syncBackup(operation, syncFn, options = {}) {
    try {
      syncFn();
    } catch (err) {
      this.warn(`JSON backup sync failed during ${operation}: ${err.message}`);
      if (options.logSyncFailure !== false) {
        this.logBackup({
          action: 'json_backup_sync_fail',
          message: 'Failed to sync JSON backup from SQLite primary',
          operation,
          error: err.message
        });
      }
    }
  }

  logBackup(entry) {
    try {
      this.backup.appendLog({
        ts: new Date().toISOString(),
        ...entry
      });
    } catch {
      // keep failover non-blocking
    }
  }

  updateWarningState() {
    const failures = this.stats.sqlite_primary_fail;
    const successes = this.stats.sqlite_primary_ok;
    const total = failures + successes;
    const ratio = total > 0 ? failures / total : 0;
    const next = this.isWarningActive(failures, ratio);
    if (next === this.warningActive) return;

    this.warningActive = next;
    if (next) {
      const ratioPercent = (ratio * 100).toFixed(1);
      this.warn(
        `SQLite failover warning: ${failures} failures, ${ratioPercent}% failure ratio ` +
        `(threshold ${Math.round(this.warningRatioThreshold * 100)}%, min ${this.warningMinFailures} failures).`
      );
      this.logBackup({
        action: 'sqlite_primary_warning',
        message: 'SQLite failover warning threshold reached',
        failures,
        failure_ratio: Number(ratio.toFixed(4))
      });
      return;
    }

    this.warn('SQLite failover warning cleared: primary failure ratio is below configured threshold.');
    this.logBackup({
      action: 'sqlite_primary_warning_cleared',
      message: 'SQLite failover warning threshold cleared',
      failures,
      failure_ratio: Number(ratio.toFixed(4))
    });
  }

  isWarningActive(failures, ratio) {
    return failures >= this.warningMinFailures && ratio >= this.warningRatioThreshold;
  }

  getRouteMode() {
    const state = this.policy.beforeOperation(this.getMetrics());
    if (state === 'recovery_probe') {
      this.stats.policy_probe_attempts += 1;
    }
    if (this.isRollbackState(state)) {
      this.inRollbackMode = true;
    }
    return state === 'json_rollback' ? 'json_rollback' : 'sqlite_primary';
  }

  getMetrics() {
    const failures = this.stats.sqlite_primary_fail;
    const successes = this.stats.sqlite_primary_ok;
    const operations = failures + successes;
    const failureRatio = operations > 0 ? failures / operations : 0;

    return {
      operations,
      failures,
      successes,
      failureRatio,
      warningActive: this.warningActive
    };
  }

  handlePolicyTransition(event) {
    this.stats.policy_transitions += 1;
    this.warn(
      `SQLite policy transition: ${event.from} -> ${event.to} (${event.reason || 'unspecified'}).`
    );
    this.logBackup({
      action: 'sqlite_policy_transition',
      message: 'SQLite failover policy state changed',
      from: event.from,
      to: event.to,
      reason: event.reason || 'unspecified',
      failures: event.failures,
      failure_ratio: Number(event.failureRatio ?? 0)
    });
  }

  isRollbackState(state) {
    return state === 'json_rollback' || state === 'recovery_probe';
  }
}

function normalizeRatio(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) return fallback;
  return n;
}

function normalizeMinFailures(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

function normalizePositiveInt(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}
