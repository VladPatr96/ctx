import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  createStorageRuntimeConfig,
  normalizeRoutingConfig,
  consumeRoutingOverride,
} from '../src/contracts/config-schemas.js';
import { createStorageAdapter } from '../src/core/storage/index.js';
import { writeJsonAtomic } from '../src/core/utils/state-io.js';

function makeTempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

async function loadRouterWithEnv(dataDir) {
  const id = Date.now() + Math.random();
  process.env.CTX_DATA_DIR = dataDir;
  process.env.CTX_ADAPTIVE_ROUTING = '0';
  return import(`../src/providers/router.js?v=${id}`);
}

test('normalizeRoutingConfig keeps only canonical overrides', () => {
  const config = normalizeRoutingConfig({
    enabled: false,
    threshold: '0.75',
    overrides: {
      planning: { provider: 'GEMINI', remaining: '2' },
      '../bad': { provider: 'claude', remaining: 1 },
      documentation: { provider: 'unknown', remaining: 1 },
      workflow: { provider: 'codex', remaining: 0 },
    },
  });

  assert.equal(config.enabled, false);
  assert.equal(config.threshold, 0.75);
  assert.deepEqual(config.overrides, {
    planning: { provider: 'gemini', remaining: 2 },
  });
});

test('consumeRoutingOverride decrements finite overrides and drops exhausted entries', () => {
  const first = consumeRoutingOverride({
    overrides: {
      planning: { provider: 'gemini', remaining: 2 },
    },
  }, 'planning');

  assert.equal(first.provider, 'gemini');
  assert.equal(first.changed, true);
  assert.deepEqual(first.config.overrides, {
    planning: { provider: 'gemini', remaining: 1 },
  });

  const second = consumeRoutingOverride(first.config, 'planning');
  assert.equal(second.provider, 'gemini');
  assert.equal(second.changed, true);
  assert.equal(second.config.overrides, undefined);
});

test('createStorageRuntimeConfig normalizes env-style runtime settings', () => {
  const { config, diagnostics } = createStorageRuntimeConfig({
    options: {},
    env: {
      CTX_STORAGE: 'sqlite',
      CTX_SHADOW_WRITE: 'true',
      CTX_SHADOW_VERIFY: 'yes',
      CTX_READ_SOURCE: 'auto',
      CTX_SQLITE_FALLBACK_JSON: '1',
      CTX_SQLITE_WARNING_RATIO: '0.4',
      CTX_SQLITE_WARNING_MIN_FAILURES: '5',
      CTX_SQLITE_AUTO_ROLLBACK: 'on',
      CTX_SQLITE_POLICY_OVERRIDE: 'json_rollback',
      CTX_SQLITE_POLICY_TRIGGER_RATIO: '0.6',
      CTX_SQLITE_POLICY_TRIGGER_MIN_FAILURES: '7',
      CTX_SQLITE_POLICY_TRIGGER_MIN_OPERATIONS: '10',
      CTX_SQLITE_POLICY_PROBE_SUCCESSES: '3',
      CTX_SQLITE_POLICY_ROLLBACK_MIN_MS: '1000',
      CTX_SQLITE_POLICY_PROBE_INTERVAL_MS: '2000',
    },
  });

  assert.equal(diagnostics.invalidPreferred, null);
  assert.equal(diagnostics.invalidReadSource, null);
  assert.equal(config.preferred, 'sqlite');
  assert.equal(config.shadowWrite, true);
  assert.equal(config.shadowVerify, true);
  assert.equal(config.readSource, 'auto');
  assert.equal(config.sqliteFallbackJson, true);
  assert.equal(config.sqliteWarningRatio, 0.4);
  assert.equal(config.sqliteWarningMinFailures, 5);
  assert.equal(config.sqliteAutoRollbackPolicy, true);
  assert.equal(config.sqlitePolicyOverride, 'json_rollback');
  assert.equal(config.sqlitePolicyTriggerRatio, 0.6);
  assert.equal(config.sqlitePolicyTriggerMinFailures, 7);
  assert.equal(config.sqlitePolicyTriggerMinOperations, 10);
  assert.equal(config.sqlitePolicyProbeSuccesses, 3);
  assert.equal(config.sqlitePolicyRollbackMinMs, 1000);
  assert.equal(config.sqlitePolicyProbeIntervalMs, 2000);
});

test('router sanitizes routing config and consumes override countdown via shared contracts', async () => {
  const dataDir = makeTempDir('ctx-routing-config-');
  const originalDataDir = process.env.CTX_DATA_DIR;
  const originalAdaptive = process.env.CTX_ADAPTIVE_ROUTING;

  try {
    writeJsonAtomic(join(dataDir, 'routing-config.json'), {
      enabled: 'yes',
      threshold: 2,
      overrides: {
        planning: { provider: 'GEMINI', remaining: '2' },
        '../bad': { provider: 'claude', remaining: 1 },
      },
    });

    const { loadRoutingConfig, route } = await loadRouterWithEnv(dataDir);
    const initial = loadRoutingConfig();
    assert.deepEqual(initial.overrides, {
      planning: { provider: 'gemini', remaining: 2 },
    });

    const first = route('plan architecture for the service');
    assert.equal(first.provider, 'gemini');

    const afterFirst = JSON.parse(readFileSync(join(dataDir, 'routing-config.json'), 'utf8'));
    assert.deepEqual(afterFirst.overrides, {
      planning: { provider: 'gemini', remaining: 1 },
    });

    const second = route('plan architecture for the service');
    assert.equal(second.provider, 'gemini');

    const afterSecond = JSON.parse(readFileSync(join(dataDir, 'routing-config.json'), 'utf8'));
    assert.equal(afterSecond.overrides, undefined);

    const third = route('plan architecture for the service');
    assert.equal(third.provider, 'claude');
  } finally {
    if (originalDataDir === undefined) delete process.env.CTX_DATA_DIR;
    else process.env.CTX_DATA_DIR = originalDataDir;
    if (originalAdaptive === undefined) delete process.env.CTX_ADAPTIVE_ROUTING;
    else process.env.CTX_ADAPTIVE_ROUTING = originalAdaptive;
    rmSync(dataDir, { recursive: true, force: true });
  }
});

test('storage adapter consumes shared storage runtime config for env-driven shadow mode', () => {
  const dataDir = makeTempDir('ctx-storage-config-');
  const originalStorage = process.env.CTX_STORAGE;
  const originalShadow = process.env.CTX_SHADOW_WRITE;
  const originalVerify = process.env.CTX_SHADOW_VERIFY;
  const originalReadSource = process.env.CTX_READ_SOURCE;

  try {
    process.env.CTX_STORAGE = 'json';
    process.env.CTX_SHADOW_WRITE = 'true';
    process.env.CTX_SHADOW_VERIFY = 'yes';
    process.env.CTX_READ_SOURCE = 'sqlite';

    const warnings = [];
    const adapter = createStorageAdapter({
      dataDir,
      onWarning: (message) => warnings.push(message),
    });

    if (adapter.shadow) {
      assert.equal(adapter.mode, 'json');
      assert.equal(adapter.readSource, 'sqlite');
      assert.equal(adapter.store.readSource, 'sqlite');
      assert.equal(adapter.store.verifyWrites, true);
    } else {
      assert.equal(adapter.mode, 'json');
      assert.ok(warnings.length > 0);
    }

    if (typeof adapter.store.close === 'function') adapter.store.close();
  } finally {
    if (originalStorage === undefined) delete process.env.CTX_STORAGE;
    else process.env.CTX_STORAGE = originalStorage;
    if (originalShadow === undefined) delete process.env.CTX_SHADOW_WRITE;
    else process.env.CTX_SHADOW_WRITE = originalShadow;
    if (originalVerify === undefined) delete process.env.CTX_SHADOW_VERIFY;
    else process.env.CTX_SHADOW_VERIFY = originalVerify;
    if (originalReadSource === undefined) delete process.env.CTX_READ_SOURCE;
    else process.env.CTX_READ_SOURCE = originalReadSource;
    rmSync(dataDir, { recursive: true, force: true });
  }
});
