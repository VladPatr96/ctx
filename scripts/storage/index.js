import { JsonStore } from './json-store.js';
import { SqliteStore } from './sqlite-store.js';
import { ShadowStore } from './shadow-store.js';
import { FailoverStore } from './failover-store.js';
import { normalizeStorageMode } from './storage-adapter.js';

export function resolveDataDir(options = {}) {
  if (options.dataDir) return options.dataDir;
  if (process.env.CTX_DATA_DIR && process.env.CTX_DATA_DIR.trim()) {
    return process.env.CTX_DATA_DIR.trim();
  }
  return '.data';
}

export function createStorageAdapter(options = {}) {
  const dataDir = resolveDataDir(options);
  const warn = typeof options.onWarning === 'function' ? options.onWarning : () => {};
  const requested = options.preferred ?? process.env.CTX_STORAGE ?? 'json';
  const mode = normalizeStorageMode(requested);
  const shadowWrite = parseBool(options.shadowWrite ?? process.env.CTX_SHADOW_WRITE);
  const shadowVerify = parseBool(options.shadowVerify ?? process.env.CTX_SHADOW_VERIFY);
  const requestedReadSource = options.readSource ?? process.env.CTX_READ_SOURCE ?? 'json';
  const normalizedReadSource = normalizeReadSource(requestedReadSource);
  const sqliteFallbackJson = parseBool(
    options.sqliteFallbackJson ?? process.env.CTX_SQLITE_FALLBACK_JSON
  );
  const sqliteWarningRatio = parseRatio(
    options.sqliteWarningRatio ?? process.env.CTX_SQLITE_WARNING_RATIO,
    0.3
  );
  const sqliteWarningMinFailures = parsePositiveInt(
    options.sqliteWarningMinFailures ?? process.env.CTX_SQLITE_WARNING_MIN_FAILURES,
    3
  );
  const sqliteAutoRollbackPolicy = parseBool(
    options.sqliteAutoRollbackPolicy ?? process.env.CTX_SQLITE_AUTO_ROLLBACK
  );
  const sqlitePolicyOverride = parseChoice(
    options.sqlitePolicyOverride ?? process.env.CTX_SQLITE_POLICY_OVERRIDE,
    ['auto', 'sqlite_primary', 'json_rollback'],
    'auto'
  );
  const sqlitePolicyTriggerRatio = parseRatio(
    options.sqlitePolicyTriggerRatio ?? process.env.CTX_SQLITE_POLICY_TRIGGER_RATIO,
    sqliteWarningRatio
  );
  const sqlitePolicyTriggerMinFailures = parsePositiveInt(
    options.sqlitePolicyTriggerMinFailures ?? process.env.CTX_SQLITE_POLICY_TRIGGER_MIN_FAILURES,
    sqliteWarningMinFailures
  );
  const sqlitePolicyTriggerMinOperations = parsePositiveInt(
    options.sqlitePolicyTriggerMinOperations ?? process.env.CTX_SQLITE_POLICY_TRIGGER_MIN_OPERATIONS,
    Math.max(sqliteWarningMinFailures * 2, 6)
  );
  const sqlitePolicyProbeSuccesses = parsePositiveInt(
    options.sqlitePolicyProbeSuccesses ?? process.env.CTX_SQLITE_POLICY_PROBE_SUCCESSES,
    2
  );
  const sqlitePolicyRollbackMinMs = parsePositiveInt(
    options.sqlitePolicyRollbackMinMs ?? process.env.CTX_SQLITE_POLICY_ROLLBACK_MIN_MS,
    30000
  );
  const sqlitePolicyProbeIntervalMs = parsePositiveInt(
    options.sqlitePolicyProbeIntervalMs ?? process.env.CTX_SQLITE_POLICY_PROBE_INTERVAL_MS,
    15000
  );

  if (mode === 'sqlite') {
    try {
      const primary = new SqliteStore({ dataDir, dbFile: options.dbFile });
      if (sqliteFallbackJson) {
        const backup = new JsonStore({ dataDir });
        return {
          mode: 'sqlite',
          failover: true,
          store: new FailoverStore({
            primary,
            backup,
            onWarning: warn,
            enableFallback: true,
            warningRatioThreshold: sqliteWarningRatio,
            warningMinFailures: sqliteWarningMinFailures,
            autoRollbackPolicy: sqliteAutoRollbackPolicy,
            policyOverride: sqlitePolicyOverride,
            policyTriggerFailureRatio: sqlitePolicyTriggerRatio,
            policyTriggerMinFailures: sqlitePolicyTriggerMinFailures,
            policyTriggerMinOperations: sqlitePolicyTriggerMinOperations,
            policyProbeSuccesses: sqlitePolicyProbeSuccesses,
            policyRollbackMinMs: sqlitePolicyRollbackMinMs,
            policyProbeIntervalMs: sqlitePolicyProbeIntervalMs
          })
        };
      }
      return {
        mode: 'sqlite',
        failover: false,
        store: primary
      };
    } catch (err) {
      warn(`SQLite adapter unavailable: ${err.message}. Falling back to JSON store.`);
    }
  } else if (mode !== 'json') {
    warn(`Unknown CTX_STORAGE mode "${requested}". Falling back to JSON store.`);
  }

  const primary = new JsonStore({ dataDir });
  if (shadowWrite) {
    const readSource = normalizedReadSource || 'json';
    if (!normalizedReadSource) {
      warn(`Unknown CTX_READ_SOURCE value "${requestedReadSource}". Falling back to "json".`);
    }

    try {
      const mirror = new SqliteStore({ dataDir, dbFile: options.dbFile });
      return {
        mode: 'json',
        shadow: true,
        readSource,
        store: new ShadowStore({
          primary,
          mirror,
          readSource,
          verifyWrites: shadowVerify,
          onWarning: warn
        })
      };
    } catch (err) {
      warn(`Shadow mirror disabled: ${err.message}. Continuing with JSON-only store.`);
    }
  }

  return {
    mode: 'json',
    shadow: false,
    store: primary
  };
}

function parseBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function normalizeReadSource(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'json' || normalized === 'sqlite' || normalized === 'auto') return normalized;
  return null;
}

function parsePositiveInt(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return fallback;
  return Math.max(1, Math.floor(normalized));
}

function parseRatio(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1) return fallback;
  return normalized;
}

function parseChoice(value, allowed, fallback) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}
