import { z } from 'zod';
import { ProviderKeySchema, TaskTypeSchema, UnitIntervalSchema } from './runtime-schemas.js';

export const StorageModeSchema = z.enum(['json', 'sqlite']);
export const StorageReadSourceSchema = z.enum(['json', 'sqlite', 'auto']);
export const StoragePolicyOverrideSchema = z.enum(['auto', 'sqlite_primary', 'json_rollback']);
export const RoutingOverrideProviderSchema = z.enum(['claude', 'gemini', 'codex', 'opencode']);

export const RoutingOverrideSchema = z.object({
  provider: RoutingOverrideProviderSchema,
  remaining: z.number().int().positive().optional(),
}).strict();

export const RoutingConfigSchema = z.object({
  enabled: z.boolean().optional(),
  threshold: UnitIntervalSchema.optional(),
  overrides: z.record(TaskTypeSchema, RoutingOverrideSchema).optional(),
}).strict();

export const StorageRuntimeConfigSchema = z.object({
  preferred: StorageModeSchema,
  shadowWrite: z.boolean(),
  shadowVerify: z.boolean(),
  readSource: StorageReadSourceSchema,
  sqliteFallbackJson: z.boolean(),
  sqliteWarningRatio: UnitIntervalSchema,
  sqliteWarningMinFailures: z.number().int().positive(),
  sqliteAutoRollbackPolicy: z.boolean(),
  sqlitePolicyOverride: StoragePolicyOverrideSchema,
  sqlitePolicyTriggerRatio: UnitIntervalSchema,
  sqlitePolicyTriggerMinFailures: z.number().int().positive(),
  sqlitePolicyTriggerMinOperations: z.number().int().positive(),
  sqlitePolicyProbeSuccesses: z.number().int().positive(),
  sqlitePolicyRollbackMinMs: z.number().int().positive(),
  sqlitePolicyProbeIntervalMs: z.number().int().positive(),
}).strict();

export function parseRoutingConfig(input) {
  return RoutingConfigSchema.parse(input ?? {});
}

export function normalizeRoutingConfig(input) {
  if (!isRecord(input)) {
    return parseRoutingConfig({});
  }

  const normalized = {};
  if (typeof input.enabled === 'boolean') {
    normalized.enabled = input.enabled;
  }

  const threshold = normalizeRatio(input.threshold);
  if (threshold !== null) {
    normalized.threshold = threshold;
  }

  const overrides = {};
  const rawOverrides = isRecord(input.overrides) ? input.overrides : {};
  for (const [taskType, override] of Object.entries(rawOverrides)) {
    const normalizedOverride = normalizeRoutingOverride(taskType, override);
    if (normalizedOverride) {
      overrides[taskType] = normalizedOverride;
    }
  }

  if (Object.keys(overrides).length > 0) {
    normalized.overrides = overrides;
  }

  return parseRoutingConfig(normalized);
}

export function consumeRoutingOverride(config, taskType) {
  const normalizedConfig = normalizeRoutingConfig(config);
  const override = normalizedConfig.overrides?.[taskType];
  if (!override) {
    return { provider: null, changed: false, config: normalizedConfig };
  }

  if (override.remaining === undefined) {
    return { provider: override.provider, changed: false, config: normalizedConfig };
  }

  const nextOverrides = { ...(normalizedConfig.overrides ?? {}) };
  const remaining = override.remaining - 1;
  if (remaining <= 0) {
    delete nextOverrides[taskType];
  } else {
    nextOverrides[taskType] = {
      ...override,
      remaining,
    };
  }

  const nextConfig = parseRoutingConfig({
    ...normalizedConfig,
    overrides: Object.keys(nextOverrides).length > 0 ? nextOverrides : undefined,
  });

  return { provider: override.provider, changed: true, config: nextConfig };
}

export function normalizeStorageMode(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return StorageModeSchema.options.includes(normalized) ? normalized : null;
}

export function normalizeStorageReadSource(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return StorageReadSourceSchema.options.includes(normalized) ? normalized : null;
}

export function createStorageRuntimeConfig({ options = {}, env = process.env } = {}) {
  const requestedMode = options.preferred ?? env.CTX_STORAGE ?? 'json';
  const requestedReadSource = options.readSource ?? env.CTX_READ_SOURCE ?? 'json';
  const preferred = normalizeStorageMode(requestedMode) ?? 'json';
  const readSource = normalizeStorageReadSource(requestedReadSource) ?? 'json';
  const sqliteWarningRatio = normalizeRatio(
    options.sqliteWarningRatio ?? env.CTX_SQLITE_WARNING_RATIO,
    0.3
  );
  const sqliteWarningMinFailures = normalizePositiveInt(
    options.sqliteWarningMinFailures ?? env.CTX_SQLITE_WARNING_MIN_FAILURES,
    3
  );

  const config = StorageRuntimeConfigSchema.parse({
    preferred,
    shadowWrite: normalizeBoolean(options.shadowWrite ?? env.CTX_SHADOW_WRITE),
    shadowVerify: normalizeBoolean(options.shadowVerify ?? env.CTX_SHADOW_VERIFY),
    readSource,
    sqliteFallbackJson: normalizeBoolean(
      options.sqliteFallbackJson ?? env.CTX_SQLITE_FALLBACK_JSON
    ),
    sqliteWarningRatio,
    sqliteWarningMinFailures,
    sqliteAutoRollbackPolicy: normalizeBoolean(
      options.sqliteAutoRollbackPolicy ?? env.CTX_SQLITE_AUTO_ROLLBACK
    ),
    sqlitePolicyOverride: normalizeChoice(
      options.sqlitePolicyOverride ?? env.CTX_SQLITE_POLICY_OVERRIDE,
      StoragePolicyOverrideSchema.options,
      'auto'
    ),
    sqlitePolicyTriggerRatio: normalizeRatio(
      options.sqlitePolicyTriggerRatio ?? env.CTX_SQLITE_POLICY_TRIGGER_RATIO,
      sqliteWarningRatio
    ),
    sqlitePolicyTriggerMinFailures: normalizePositiveInt(
      options.sqlitePolicyTriggerMinFailures ?? env.CTX_SQLITE_POLICY_TRIGGER_MIN_FAILURES,
      sqliteWarningMinFailures
    ),
    sqlitePolicyTriggerMinOperations: normalizePositiveInt(
      options.sqlitePolicyTriggerMinOperations ?? env.CTX_SQLITE_POLICY_TRIGGER_MIN_OPERATIONS,
      Math.max(sqliteWarningMinFailures * 2, 6)
    ),
    sqlitePolicyProbeSuccesses: normalizePositiveInt(
      options.sqlitePolicyProbeSuccesses ?? env.CTX_SQLITE_POLICY_PROBE_SUCCESSES,
      2
    ),
    sqlitePolicyRollbackMinMs: normalizePositiveInt(
      options.sqlitePolicyRollbackMinMs ?? env.CTX_SQLITE_POLICY_ROLLBACK_MIN_MS,
      30000
    ),
    sqlitePolicyProbeIntervalMs: normalizePositiveInt(
      options.sqlitePolicyProbeIntervalMs ?? env.CTX_SQLITE_POLICY_PROBE_INTERVAL_MS,
      15000
    ),
  });

  return {
    config,
    diagnostics: {
      invalidPreferred: preferred === 'json' ? invalidDiagnosticValue(requestedMode, preferred) : null,
      invalidReadSource: readSource === 'json' ? invalidDiagnosticValue(requestedReadSource, readSource) : null,
    },
  };
}

function normalizeRoutingOverride(taskType, override) {
  if (!TaskTypeSchema.safeParse(taskType).success || !isRecord(override)) {
    return null;
  }

  const provider = normalizeProviderKey(override.provider);
  if (!provider || !ProviderKeySchema.safeParse(provider).success) {
    return null;
  }

  if (!RoutingOverrideProviderSchema.safeParse(provider).success) {
    return null;
  }

  const remaining = normalizeOverrideRemaining(override.remaining);
  if (override.remaining !== undefined && override.remaining !== null && remaining === null) {
    return null;
  }

  return RoutingOverrideSchema.parse({
    provider,
    ...(remaining === null ? {} : { remaining }),
  });
}

function normalizeProviderKey(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized || null;
}

function normalizeOverrideRemaining(value) {
  if (value === null || value === undefined || value === '') return null;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized <= 0) return null;
  return Math.floor(normalized);
}

function normalizeBoolean(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on';
}

function normalizePositiveInt(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return fallback;
  return Math.max(1, Math.floor(normalized));
}

function normalizeRatio(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0 || normalized > 1) return fallback;
  return normalized;
}

function normalizeChoice(value, allowed, fallback) {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  return allowed.includes(normalized) ? normalized : fallback;
}

function invalidDiagnosticValue(value, normalized) {
  if (value === null || value === undefined) return null;
  const stringified = String(value).trim();
  if (!stringified) return null;
  return stringified.toLowerCase() === normalized ? null : stringified;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
