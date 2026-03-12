import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';
import { createStorageAdapter } from '../scripts/storage/index.js';

test('createStorageAdapter falls back to json on unknown mode', () => {
  const warnings = [];
  const dataDir = mkdtempSync(join(tmpdir(), 'ctx-storage-'));
  const { mode, store } = createStorageAdapter({
    dataDir,
    preferred: 'mystery',
    onWarning: (message) => warnings.push(message)
  });

  assert.equal(mode, 'json');
  assert.equal(typeof store.readPipeline, 'function');
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /Unknown CTX_STORAGE mode/i);
});

test('json store persists pipeline and logs to files', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'ctx-json-store-'));
  const { mode, store } = createStorageAdapter({ dataDir, preferred: 'json' });
  assert.equal(mode, 'json');

  const pipeline = { stage: 'task', lead: 'codex', task: 'day6' };
  store.writePipeline(pipeline);
  store.appendLog({ ts: '2026-02-18T00:00:00.000Z', action: 'test', message: 'ok' });
  store.appendLog({ ts: '2026-02-18T00:01:00.000Z', action: 'followup', message: 'still ok' });

  const loaded = store.readPipeline({ stage: 'detect' });
  assert.equal(loaded.task, 'day6');
  const logEntries = store.readLog(10);
  assert.equal(logEntries.length, 2);
  assert.equal(logEntries[1].action, 'followup');

  const logFile = join(dataDir, 'log.jsonl');
  assert.equal(existsSync(logFile), true);
  const logLine = readFileSync(logFile, 'utf8').trim();
  assert.match(logLine, /"action":"test"/);
});

test('sqlite store can be selected when available', () => {
  const warnings = [];
  const dataDir = mkdtempSync(join(tmpdir(), 'ctx-sqlite-store-'));
  const { mode, store } = createStorageAdapter({
    dataDir,
    preferred: 'sqlite',
    onWarning: (message) => warnings.push(message)
  });

  if (mode === 'sqlite') {
    const pipeline = { stage: 'plan', lead: 'codex', task: 'sqlite-check' };
    store.writePipeline(pipeline);
    store.appendLog({ ts: '2026-02-18T00:00:00.000Z', action: 'sqlite-test', message: 'ok' });
    const loaded = store.readPipeline({ stage: 'detect' });
    assert.equal(loaded.task, 'sqlite-check');
    const logEntries = store.readLog(10);
    assert.equal(logEntries.length, 1);
    assert.equal(logEntries[0].action, 'sqlite-test');
  } else {
    assert.equal(mode, 'json');
    assert.ok(warnings.length > 0);
  }

  if (typeof store.close === 'function') store.close();
});

test('shadow-write mode uses json primary with sqlite mirror when enabled', () => {
  const warnings = [];
  const dataDir = mkdtempSync(join(tmpdir(), 'ctx-shadow-store-'));
  const adapter = createStorageAdapter({
    dataDir,
    preferred: 'json',
    shadowWrite: true,
    onWarning: (message) => warnings.push(message)
  });

  if (adapter.shadow) {
    assert.equal(adapter.mode, 'json');
    assert.equal(typeof adapter.store.getShadowStats, 'function');
    adapter.store.writePipeline({ stage: 'task', lead: 'codex', task: 'shadow' });
    const loaded = adapter.store.readPipeline({});
    assert.equal(loaded.task, 'shadow');
    const stats = adapter.store.getShadowStats();
    assert.ok(stats.mirror_ok >= 1);
  } else {
    assert.equal(adapter.mode, 'json');
    assert.ok(warnings.length > 0);
  }

  if (typeof adapter.store.close === 'function') adapter.store.close();
});

test('shadow-write mode can read from sqlite mirror when readSource=sqlite', () => {
  const warnings = [];
  const dataDir = mkdtempSync(join(tmpdir(), 'ctx-shadow-read-sqlite-'));
  const adapter = createStorageAdapter({
    dataDir,
    preferred: 'json',
    shadowWrite: true,
    readSource: 'sqlite',
    onWarning: (message) => warnings.push(message)
  });

  if (adapter.shadow) {
    adapter.store.primary.writePipeline({ stage: 'task', lead: 'codex', task: 'json-primary' });
    adapter.store.mirror.writePipeline({ stage: 'task', lead: 'codex', task: 'sqlite-mirror' });
    const loaded = adapter.store.readPipeline({});
    assert.equal(loaded.task, 'sqlite-mirror');
    const stats = adapter.store.getShadowStats();
    assert.equal(stats.read_sqlite_ok, 1);
  } else {
    assert.equal(adapter.mode, 'json');
    assert.ok(warnings.length > 0);
  }

  if (typeof adapter.store.close === 'function') adapter.store.close();
});

test('shadow-write mode falls back to json readSource on unknown value', () => {
  const warnings = [];
  const dataDir = mkdtempSync(join(tmpdir(), 'ctx-shadow-read-invalid-'));
  const adapter = createStorageAdapter({
    dataDir,
    preferred: 'json',
    shadowWrite: true,
    readSource: 'mystery',
    onWarning: (message) => warnings.push(message)
  });

  if (adapter.shadow) {
    assert.equal(adapter.readSource, 'json');
    adapter.store.primary.writePipeline({ stage: 'task', lead: 'codex', task: 'json-primary' });
    adapter.store.mirror.writePipeline({ stage: 'task', lead: 'codex', task: 'sqlite-mirror' });
    const loaded = adapter.store.readPipeline({});
    assert.equal(loaded.task, 'json-primary');
    assert.ok(warnings.some(message => /Unknown CTX_READ_SOURCE value/i.test(message)));
  } else {
    assert.equal(adapter.mode, 'json');
    assert.ok(warnings.length > 0);
  }

  if (typeof adapter.store.close === 'function') adapter.store.close();
});

test('sqlite mode can enable runtime json failover wrapper', () => {
  const warnings = [];
  const dataDir = mkdtempSync(join(tmpdir(), 'ctx-sqlite-failover-'));
  const adapter = createStorageAdapter({
    dataDir,
    preferred: 'sqlite',
    sqliteFallbackJson: true,
    onWarning: (message) => warnings.push(message)
  });

  if (adapter.mode === 'sqlite') {
    assert.equal(adapter.failover, true);
    assert.equal(typeof adapter.store.getFailoverStats, 'function');
    adapter.store.writePipeline({ stage: 'task', lead: 'codex', task: 'sqlite-primary' });
    const loaded = adapter.store.readPipeline({ stage: 'detect' });
    assert.equal(loaded.task, 'sqlite-primary');
  } else {
    assert.equal(adapter.mode, 'json');
    assert.ok(warnings.length > 0);
  }

  if (typeof adapter.store.close === 'function') adapter.store.close();
});

test('sqlite failover wrapper can enable auto rollback policy', () => {
  const warnings = [];
  const dataDir = mkdtempSync(join(tmpdir(), 'ctx-sqlite-policy-'));
  const adapter = createStorageAdapter({
    dataDir,
    preferred: 'sqlite',
    sqliteFallbackJson: true,
    sqliteAutoRollbackPolicy: true,
    sqlitePolicyOverride: 'auto',
    sqlitePolicyTriggerRatio: 0.4,
    sqlitePolicyTriggerMinFailures: 2,
    sqlitePolicyTriggerMinOperations: 4,
    sqlitePolicyProbeSuccesses: 2,
    sqlitePolicyRollbackMinMs: 10,
    sqlitePolicyProbeIntervalMs: 10,
    onWarning: (message) => warnings.push(message)
  });

  if (adapter.mode === 'sqlite') {
    const health = adapter.store.getHealthSnapshot();
    assert.equal(health.policy.enabled, true);
    assert.equal(health.policy.override, 'auto');
    assert.equal(health.policy.thresholds.triggerFailureRatio, 0.4);
    assert.equal(health.policy.thresholds.triggerMinFailures, 2);
  } else {
    assert.equal(adapter.mode, 'json');
    assert.ok(warnings.length > 0);
  }

  if (typeof adapter.store.close === 'function') adapter.store.close();
});
