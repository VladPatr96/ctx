import test from 'node:test';
import assert from 'node:assert/strict';
import { FailoverStore } from '../scripts/storage/failover-store.js';

class MemoryStore {
  constructor(options = {}) {
    this.failRead = Boolean(options.failRead);
    this.failWrite = Boolean(options.failWrite);
    this.failLog = Boolean(options.failLog);
    this.failClear = Boolean(options.failClear);
    this.readCalls = 0;
    this.writeCalls = 0;
    this.logCalls = 0;
    this.clearCalls = 0;
    this.pipeline = null;
    this.logs = [];
  }

  readPipeline(fallbackValue) {
    this.readCalls += 1;
    if (this.failRead) throw new Error('read failed');
    return this.pipeline ?? fallbackValue;
  }

  readLog(limit = 50) {
    this.readCalls += 1;
    if (this.failRead) throw new Error('read failed');
    return this.logs.slice(-limit);
  }

  writePipeline(pipeline) {
    this.writeCalls += 1;
    if (this.failWrite) throw new Error('write failed');
    this.pipeline = JSON.parse(JSON.stringify(pipeline));
  }

  appendLog(entry) {
    this.logCalls += 1;
    if (this.failLog) throw new Error('append failed');
    this.logs.push(entry);
  }

  clearLog() {
    this.clearCalls += 1;
    if (this.failClear) throw new Error('clear failed');
    this.logs = [];
  }
}

test('failover store uses sqlite primary and mirrors backup on success path', () => {
  const primary = new MemoryStore();
  const backup = new MemoryStore();
  const store = new FailoverStore({ primary, backup });

  store.writePipeline({ stage: 'task', lead: 'codex', task: 'day9' });
  store.appendLog({ ts: '2026-02-19T00:00:00.000Z', action: 'ok', message: 'primary' });

  assert.equal(primary.pipeline.task, 'day9');
  assert.equal(backup.pipeline.task, 'day9');
  assert.equal(primary.logs.length, 1);
  assert.equal(backup.logs.length, 1);
  const stats = store.getFailoverStats();
  assert.equal(stats.sqlite_primary_ok, 2);
  assert.equal(stats.sqlite_primary_fail, 0);
  assert.equal(stats.rollback_to_json, 0);
});

test('failover store falls back to json backup when sqlite read fails', () => {
  const primary = new MemoryStore({ failRead: true });
  const backup = new MemoryStore();
  backup.writePipeline({ stage: 'task', lead: 'codex', task: 'backup' });
  const store = new FailoverStore({ primary, backup });

  const loaded = store.readPipeline({ stage: 'detect' });

  assert.equal(loaded.task, 'backup');
  const stats = store.getFailoverStats();
  assert.equal(stats.sqlite_primary_fail, 1);
  assert.equal(stats.rollback_to_json, 1);
  assert.equal(backup.logs.some(entry => entry.action === 'sqlite_primary_failover'), true);
});

test('failover store tracks recovery after primary comes back', () => {
  const primary = new MemoryStore({ failWrite: true });
  const backup = new MemoryStore();
  const store = new FailoverStore({ primary, backup });

  store.writePipeline({ stage: 'task', lead: 'codex', task: 'fallback-write' });
  primary.failWrite = false;
  store.writePipeline({ stage: 'task', lead: 'codex', task: 'primary-recovered' });

  const stats = store.getFailoverStats();
  assert.equal(stats.rollback_to_json, 1);
  assert.equal(stats.rollback_recoveries, 1);
  assert.equal(primary.pipeline.task, 'primary-recovered');
});

test('failover store throws when both primary and backup fail', () => {
  const primary = new MemoryStore({ failWrite: true });
  const backup = new MemoryStore({ failWrite: true });
  const store = new FailoverStore({ primary, backup });

  assert.throws(
    () => store.writePipeline({ stage: 'task', lead: 'codex', task: 'boom' }),
    /SQLite primary and JSON backup failed during writePipeline/
  );
});

test('failover store exposes health snapshot fields', () => {
  const primary = new MemoryStore();
  const backup = new MemoryStore();
  const store = new FailoverStore({ primary, backup });

  store.writePipeline({ stage: 'task', lead: 'codex', task: 'health' });
  const snapshot = store.getHealthSnapshot();

  assert.equal(snapshot.mode, 'sqlite-primary');
  assert.equal(snapshot.failoverEnabled, true);
  assert.equal(snapshot.warningActive, false);
  assert.equal(snapshot.inRollbackMode, false);
  assert.equal(snapshot.totals.operations, 1);
  assert.equal(snapshot.counters.sqlite_primary_ok, 1);
});

test('failover warning activates and clears based on ratio threshold', () => {
  const warnings = [];
  const primary = new MemoryStore({ failRead: true });
  const backup = new MemoryStore();
  backup.writePipeline({ stage: 'task', lead: 'codex', task: 'fallback' });
  const store = new FailoverStore({
    primary,
    backup,
    warningMinFailures: 1,
    warningRatioThreshold: 0.5,
    onWarning: (message) => warnings.push(message)
  });

  store.readPipeline({ stage: 'detect' });
  let snapshot = store.getHealthSnapshot();
  assert.equal(snapshot.warningActive, true);
  assert.ok(warnings.some((message) => /warning/i.test(message)));

  primary.failRead = false;
  primary.writePipeline({ stage: 'task', lead: 'codex', task: 'primary' });
  store.readPipeline({ stage: 'detect' });
  store.readPipeline({ stage: 'detect' });
  snapshot = store.getHealthSnapshot();
  assert.equal(snapshot.warningActive, false);
  assert.ok(warnings.some((message) => /warning cleared/i.test(message)));
});

test('auto rollback policy transitions to json rollback and recovers via probes', () => {
  let now = 0;
  const primary = new MemoryStore({ failRead: true });
  const backup = new MemoryStore();
  backup.writePipeline({ stage: 'task', lead: 'codex', task: 'backup-primary' });
  const store = new FailoverStore({
    primary,
    backup,
    warningMinFailures: 1,
    warningRatioThreshold: 0.5,
    autoRollbackPolicy: true,
    policyTriggerFailureRatio: 0.5,
    policyTriggerMinFailures: 1,
    policyTriggerMinOperations: 1,
    policyRollbackMinMs: 10,
    policyProbeIntervalMs: 10,
    policyProbeSuccesses: 2,
    policyNow: () => now
  });

  const first = store.readPipeline({ stage: 'detect' });
  assert.equal(first.task, 'backup-primary');
  assert.equal(store.getHealthSnapshot().policyState, 'json_rollback');

  primary.failRead = false;
  primary.writePipeline({ stage: 'task', lead: 'codex', task: 'sqlite-primary' });
  const second = store.readPipeline({ stage: 'detect' });
  assert.equal(second.task, 'backup-primary');
  assert.equal(store.getFailoverStats().policy_forced_json_ops, 1);

  now = 20;
  const probe1 = store.readPipeline({ stage: 'detect' });
  assert.equal(probe1.task, 'sqlite-primary');
  assert.equal(store.getHealthSnapshot().policyState, 'recovery_probe');

  const probe2 = store.readPipeline({ stage: 'detect' });
  assert.equal(probe2.task, 'sqlite-primary');

  const snapshot = store.getHealthSnapshot();
  assert.equal(snapshot.policyState, 'sqlite_primary');
  assert.equal(snapshot.inRollbackMode, false);
  assert.equal(snapshot.counters.rollback_recoveries, 1);
  assert.equal(snapshot.counters.policy_probe_attempts, 2);
  assert.equal(snapshot.counters.policy_probe_success, 2);
});

test('policy override json_rollback forces backup route without touching sqlite', () => {
  const primary = new MemoryStore();
  primary.writePipeline({ stage: 'task', lead: 'codex', task: 'sqlite-primary' });
  const backup = new MemoryStore();
  backup.writePipeline({ stage: 'task', lead: 'codex', task: 'json-backup' });
  const store = new FailoverStore({
    primary,
    backup,
    autoRollbackPolicy: true,
    policyOverride: 'json_rollback'
  });

  const loaded = store.readPipeline({ stage: 'detect' });
  assert.equal(loaded.task, 'json-backup');
  assert.equal(primary.readCalls, 0);

  const snapshot = store.getHealthSnapshot();
  assert.equal(snapshot.policyState, 'json_rollback');
  assert.equal(snapshot.counters.sqlite_primary_ok, 0);
  assert.equal(snapshot.counters.sqlite_primary_fail, 0);
  assert.equal(snapshot.counters.policy_forced_json_ops, 1);
});

test('failover store falls back to json backup when sqlite log read fails', () => {
  const primary = new MemoryStore({ failRead: true });
  const backup = new MemoryStore();
  backup.appendLog({ action: 'backup-log', message: 'ok' });
  const store = new FailoverStore({ primary, backup });

  const logs = store.readLog(10);

  assert.equal(logs.length, 1);
  assert.equal(logs[0].action, 'backup-log');
  const stats = store.getFailoverStats();
  assert.equal(stats.sqlite_primary_fail, 1);
  assert.equal(stats.rollback_to_json, 1);
});
