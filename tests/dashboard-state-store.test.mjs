import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createStorageAdapter } from '../scripts/storage/index.js';
import { createDashboardStateStore } from '../scripts/storage/dashboard-state-store.js';

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2), 'utf8');
}

test('dashboard state store reads pipeline/log via storage adapter and sidecars via facade', () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'ctx-dashboard-state-'));
  const adapter = createStorageAdapter({ dataDir, preferred: 'json' });

  adapter.store.writePipeline({ stage: 'execute', lead: 'codex', task: 'dashboard-json' });
  adapter.store.appendLog({ ts: '2026-03-10T10:00:00.000Z', action: 'build', message: 'json-log' });

  writeJson(join(dataDir, 'index.json'), { project: 'ctx-json', stack: { runtime: 'node' } });
  writeJson(join(dataDir, 'session.json'), {
    actions: [{ time: '2026-03-10T10:01:00.000Z', action: 'write', file: 'a.js', result: 'ok' }],
    errors: [{ time: '2026-03-10T10:02:00.000Z', error: 'boom', solution: 'fix' }]
  });
  writeJson(join(dataDir, 'provider-health.json'), { claude: { calls: 1 } });
  writeJson(join(dataDir, 'results.json'), [{ time: '2026-03-10T10:03:00.000Z', provider: 'claude', task: 'consilium', result: 'done' }]);

  const store = createDashboardStateStore({ dataDir, preferred: 'json' });
  const sources = store.getSourceMap();

  assert.equal(store.readPipeline({}).task, 'dashboard-json');
  assert.equal(store.readLog(10)[0].action, 'build');
  assert.equal(store.readProjectIndex().project, 'ctx-json');
  assert.equal(store.readSession().actions[0].action, 'write');
  assert.equal(store.readProviderHealth().claude.calls, 1);
  assert.equal(store.readResults()[0].provider, 'claude');
  assert.equal(sources.pipeline.source, 'storage-adapter');
  assert.equal(sources.log.source, 'storage-adapter');
  assert.equal(sources.index.source, 'dashboard-state-store-sidecar');
});

test('dashboard state store honors sqlite mode for pipeline/log reads when available', () => {
  const warnings = [];
  const dataDir = mkdtempSync(join(tmpdir(), 'ctx-dashboard-state-sqlite-'));
  const adapter = createStorageAdapter({
    dataDir,
    preferred: 'sqlite',
    onWarning: (message) => warnings.push(message)
  });

  if (adapter.mode === 'sqlite') {
    adapter.store.writePipeline({ stage: 'plan', lead: 'claude', task: 'dashboard-sqlite' });
    adapter.store.appendLog({ ts: '2026-03-10T11:00:00.000Z', action: 'sqlite-build', message: 'sqlite-log' });

    const store = createDashboardStateStore({ dataDir, preferred: 'sqlite' });
    const sources = store.getSourceMap();
    const logs = store.readLog(10);

    assert.equal(store.readPipeline({}).task, 'dashboard-sqlite');
    assert.equal(logs.length, 1);
    assert.equal(logs[0].action, 'sqlite-build');
    assert.match(sources.pipeline.backing, /^sqlite/);
    assert.match(sources.log.backing, /^sqlite/);

    store.close();
  } else {
    assert.equal(adapter.mode, 'json');
    assert.ok(warnings.length > 0);
  }

  if (typeof adapter.store.close === 'function') adapter.store.close();
});
