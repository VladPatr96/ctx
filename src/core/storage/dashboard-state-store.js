import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createStorageAdapter, resolveDataDir } from './index.js';
import { readJsonFile } from '../utils/state-io.js';

export function createDashboardStateStore(options = {}) {
  const dataDir = resolveDataDir(options);
  const adapter = createStorageAdapter({
    dataDir,
    preferred: options.preferred ?? process.env.CTX_STORAGE,
    shadowWrite: options.shadowWrite ?? process.env.CTX_SHADOW_WRITE,
    shadowVerify: options.shadowVerify ?? process.env.CTX_SHADOW_VERIFY,
    readSource: options.readSource ?? process.env.CTX_READ_SOURCE,
    sqliteFallbackJson: options.sqliteFallbackJson ?? process.env.CTX_SQLITE_FALLBACK_JSON,
    onWarning: options.onWarning,
  });

  const files = {
    index: join(dataDir, 'index.json'),
    providerHealth: join(dataDir, 'provider-health.json'),
    session: join(dataDir, 'session.json'),
    results: join(dataDir, 'results.json'),
  };

  return {
    dataDir,
    storage: adapter,
    readPipeline(fallbackValue = null) {
      return adapter.store.readPipeline(fallbackValue);
    },
    readLog(limit = 50) {
      if (typeof adapter.store.readLog === 'function') {
        return adapter.store.readLog(limit);
      }
      return readLogLines(join(dataDir, 'log.jsonl'), limit);
    },
    readProjectIndex() {
      return readJsonFile(files.index, null);
    },
    readProviderHealth() {
      return readJsonFile(files.providerHealth, null);
    },
    readSession() {
      return readJsonFile(files.session, null);
    },
    readResults() {
      return readJsonFile(files.results, null);
    },
    getSourceMap() {
      return {
        pipeline: describeStorageSource('pipeline', adapter),
        log: describeStorageSource('log', adapter),
        index: describeSidecarSource(files.index),
        providerHealth: describeSidecarSource(files.providerHealth),
        session: describeSidecarSource(files.session),
        results: describeSidecarSource(files.results),
      };
    },
    close() {
      if (typeof adapter.store.close === 'function') {
        adapter.store.close();
      }
    },
  };
}

function readLogLines(path, limit) {
  try {
    if (!existsSync(path)) return [];
    const normalizedLimit = normalizeLimit(limit, 50);
    return readFileSync(path, 'utf8')
      .split('\n')
      .filter(line => line.trim())
      .slice(-normalizedLimit)
      .map(parseLogLine)
      .filter(Boolean);
  } catch {
    return [];
  }
}

function parseLogLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function normalizeLimit(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function describeStorageSource(channel, adapter) {
  const backing = adapter.mode === 'sqlite'
    ? (adapter.failover ? 'sqlite-primary-with-json-failover' : 'sqlite')
    : (adapter.shadow ? `json-shadow(read:${adapter.readSource || 'json'})` : 'json');

  return {
    source: 'storage-adapter',
    channel,
    backing,
    mode: adapter.mode,
    failover: Boolean(adapter.failover),
    shadow: Boolean(adapter.shadow),
  };
}

function describeSidecarSource(path) {
  return {
    source: 'dashboard-state-store-sidecar',
    path,
    migration: 'Keep reads inside the dashboard state facade until a dedicated storage contract replaces this sidecar.',
  };
}
