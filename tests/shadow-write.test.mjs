import test from 'node:test';
import assert from 'node:assert/strict';
import { ShadowStore } from '../scripts/storage/shadow-store.js';

class MemoryStore {
  constructor(options = {}) {
    this.failWrite = Boolean(options.failWrite);
    this.failLog = Boolean(options.failLog);
    this.failRead = Boolean(options.failRead);
    this.transformWrite = options.transformWrite || null;
    this.pipeline = null;
    this.logs = [];
  }

  readPipeline(fallbackValue) {
    if (this.failRead) throw new Error('mirror read failed');
    return this.pipeline ?? fallbackValue;
  }

  writePipeline(pipeline) {
    if (this.failWrite) throw new Error('mirror write failed');
    const next = this.transformWrite ? this.transformWrite(pipeline) : pipeline;
    this.pipeline = JSON.parse(JSON.stringify(next));
  }

  appendLog(entry) {
    if (this.failLog) throw new Error('mirror log failed');
    this.logs.push(entry);
  }

  clearLog() {
    this.logs = [];
  }
}

test('shadow store keeps primary write when mirror write fails', () => {
  const primary = new MemoryStore();
  const mirror = new MemoryStore({ failWrite: true });
  const shadow = new ShadowStore({ primary, mirror });

  shadow.writePipeline({ stage: 'plan', lead: 'codex', task: 'day7' });

  assert.equal(primary.readPipeline({}).task, 'day7');
  const stats = shadow.getShadowStats();
  assert.equal(stats.mirror_fail, 1);
  assert.equal(stats.mirror_ok, 0);
  assert.equal(primary.logs.some(e => e.action === 'shadow_mirror_fail'), true);
});

test('shadow store detects payload mismatch when verifyWrites is enabled', () => {
  const primary = new MemoryStore();
  const mirror = new MemoryStore({
    transformWrite: (pipeline) => ({ ...pipeline, task: `${pipeline.task}-changed` })
  });
  const shadow = new ShadowStore({ primary, mirror, verifyWrites: true });

  shadow.writePipeline({ stage: 'execute', lead: 'codex', task: 'day7' });

  const stats = shadow.getShadowStats();
  assert.equal(stats.mismatch_detected, 1);
  assert.equal(primary.logs.some(e => e.action === 'shadow_mismatch'), true);
});

test('shadow store keeps primary log append when mirror log fails', () => {
  const primary = new MemoryStore();
  const mirror = new MemoryStore({ failLog: true });
  const shadow = new ShadowStore({ primary, mirror });

  shadow.appendLog({ ts: '2026-02-19T00:00:00.000Z', action: 'event', message: 'ok' });

  assert.equal(primary.logs.length, 2);
  assert.equal(primary.logs[0].action, 'event');
  assert.equal(primary.logs[1].action, 'shadow_mirror_fail');
  const stats = shadow.getShadowStats();
  assert.equal(stats.mirror_fail, 1);
});

test('shadow store reads from sqlite mirror when readSource is sqlite', () => {
  const primary = new MemoryStore();
  const mirror = new MemoryStore();
  primary.writePipeline({ stage: 'task', lead: 'codex', task: 'json-primary' });
  mirror.writePipeline({ stage: 'task', lead: 'codex', task: 'sqlite-mirror' });
  const shadow = new ShadowStore({ primary, mirror, readSource: 'sqlite' });

  const loaded = shadow.readPipeline({ stage: 'detect' });

  assert.equal(loaded.task, 'sqlite-mirror');
  const stats = shadow.getShadowStats();
  assert.equal(stats.read_sqlite_ok, 1);
  assert.equal(stats.read_sqlite_fail, 0);
  assert.equal(stats.read_fallback_json, 0);
});

test('shadow store falls back to json when sqlite read fails', () => {
  const primary = new MemoryStore();
  const mirror = new MemoryStore({ failRead: true });
  primary.writePipeline({ stage: 'task', lead: 'codex', task: 'json-primary' });
  const shadow = new ShadowStore({ primary, mirror, readSource: 'sqlite' });

  const loaded = shadow.readPipeline({ stage: 'detect' });

  assert.equal(loaded.task, 'json-primary');
  const stats = shadow.getShadowStats();
  assert.equal(stats.read_sqlite_ok, 0);
  assert.equal(stats.read_sqlite_fail, 1);
  assert.equal(stats.read_fallback_json, 1);
  assert.equal(primary.logs.some(e => e.action === 'shadow_read_fallback'), true);
});

test('shadow store keeps json read path when readSource is json', () => {
  const primary = new MemoryStore();
  const mirror = new MemoryStore();
  primary.writePipeline({ stage: 'task', lead: 'codex', task: 'json-primary' });
  mirror.writePipeline({ stage: 'task', lead: 'codex', task: 'sqlite-mirror' });
  const shadow = new ShadowStore({ primary, mirror, readSource: 'json' });

  const loaded = shadow.readPipeline({ stage: 'detect' });

  assert.equal(loaded.task, 'json-primary');
  const stats = shadow.getShadowStats();
  assert.equal(stats.read_sqlite_ok, 0);
  assert.equal(stats.read_sqlite_fail, 0);
  assert.equal(stats.read_fallback_json, 0);
});
