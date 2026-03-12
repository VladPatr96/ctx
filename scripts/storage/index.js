import { JsonStore } from './json-store.js';
import { SqliteStore } from './sqlite-store.js';
import { ShadowStore } from './shadow-store.js';
import { FailoverStore } from './failover-store.js';
import { createStorageRuntimeConfig } from '../contracts/config-schemas.js';

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
  const { config, diagnostics } = createStorageRuntimeConfig({ options, env: process.env });
  const mode = config.preferred;

  if (diagnostics.invalidPreferred) {
    warn(`Unknown CTX_STORAGE mode "${diagnostics.invalidPreferred}". Falling back to JSON store.`);
  }

  if (mode === 'sqlite') {
    try {
      const primary = new SqliteStore({ dataDir, dbFile: options.dbFile });
      if (config.sqliteFallbackJson) {
        const backup = new JsonStore({ dataDir });
        return {
          mode: 'sqlite',
          failover: true,
          store: new FailoverStore({
            primary,
            backup,
            onWarning: warn,
            enableFallback: true,
            warningRatioThreshold: config.sqliteWarningRatio,
            warningMinFailures: config.sqliteWarningMinFailures,
            autoRollbackPolicy: config.sqliteAutoRollbackPolicy,
            policyOverride: config.sqlitePolicyOverride,
            policyTriggerFailureRatio: config.sqlitePolicyTriggerRatio,
            policyTriggerMinFailures: config.sqlitePolicyTriggerMinFailures,
            policyTriggerMinOperations: config.sqlitePolicyTriggerMinOperations,
            policyProbeSuccesses: config.sqlitePolicyProbeSuccesses,
            policyRollbackMinMs: config.sqlitePolicyRollbackMinMs,
            policyProbeIntervalMs: config.sqlitePolicyProbeIntervalMs
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
  }

  const primary = new JsonStore({ dataDir });
  if (config.shadowWrite) {
    if (diagnostics.invalidReadSource) {
      warn(`Unknown CTX_READ_SOURCE value "${diagnostics.invalidReadSource}". Falling back to "json".`);
    }

    try {
      const mirror = new SqliteStore({ dataDir, dbFile: options.dbFile });
      return {
        mode: 'json',
        shadow: true,
        readSource: config.readSource,
        store: new ShadowStore({
          primary,
          mirror,
          readSource: config.readSource,
          verifyWrites: config.shadowVerify,
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
