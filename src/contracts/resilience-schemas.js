import { z } from 'zod';
import { ProviderKeySchema } from './runtime-schemas.js';

export const RuntimeAvailabilityStatusSchema = z.enum(['ready', 'degraded', 'offline']);

export const StorageResilienceStatusSchema = z.object({
  status: RuntimeAvailabilityStatusSchema,
  effectiveMode: z.string().min(1),
  policyState: z.string().nullable(),
  failureRatio: z.number().min(0).max(1).nullable(),
  reasons: z.array(z.string().min(1)),
}).strict();

export const ProviderResilienceStatusSchema = z.object({
  provider: ProviderKeySchema,
  status: RuntimeAvailabilityStatusSchema,
  circuitOpen: z.boolean(),
  consecutiveFailures: z.number().int().nonnegative(),
  reasons: z.array(z.string().min(1)),
}).strict();

export function buildStorageResilienceStatus(snapshot = {}, options = {}) {
  const effectiveMode = normalizeString(snapshot.effectiveMode || snapshot.mode, 'unknown');
  const policyState = normalizeNullableString(snapshot.policyState || snapshot.policy?.effectiveState);
  const failureRatio = normalizeNullableRatio(snapshot.failureRatio ?? snapshot.totals?.failureRatio);
  const sourceCount = normalizeNonNegativeInt(options.sourceCount, 0);
  const warningActive = snapshot.warningActive === true;
  const failoverActive = snapshot.failover === true;
  const reasons = [];

  let status = 'ready';

  if (!sourceCount && effectiveMode === 'unknown') {
    status = 'offline';
    reasons.push('storage_surface_unavailable');
  } else if (effectiveMode === 'json-backup' || isRollbackPolicy(policyState)) {
    status = 'degraded';
    reasons.push('primary_storage_unavailable');
  } else if (warningActive) {
    status = 'degraded';
    reasons.push('failover_warning_active');
  } else if (failoverActive) {
    reasons.push('failover_enabled');
  }

  return StorageResilienceStatusSchema.parse({
    status,
    effectiveMode,
    policyState,
    failureRatio,
    reasons,
  });
}

export function buildProviderResilienceStatus(provider, snapshot = {}) {
  const normalizedProvider = ProviderKeySchema.parse(String(provider || '').trim().toLowerCase());
  const hasModel = typeof snapshot.model === 'string' && snapshot.model.trim().length > 0;
  const hasTelemetry = snapshot.hasTelemetry === true;
  const consecutiveFailures = normalizeNonNegativeInt(snapshot.consecutiveFailures ?? snapshot.failures, 0);
  const successRate = normalizeNullablePercent(snapshot.successRate);
  const reasons = [];

  let status = 'ready';

  if (consecutiveFailures >= 3) {
    status = 'offline';
    reasons.push('provider_circuit_open');
  } else if (!hasModel && !hasTelemetry) {
    status = 'offline';
    reasons.push('provider_unconfigured');
  } else if (consecutiveFailures > 0) {
    status = 'degraded';
    reasons.push('recent_provider_failures');
  } else if (successRate !== null && successRate < 80 && hasTelemetry) {
    status = 'degraded';
    reasons.push('low_success_rate');
  }

  return ProviderResilienceStatusSchema.parse({
    provider: normalizedProvider,
    status,
    circuitOpen: consecutiveFailures >= 3,
    consecutiveFailures,
    reasons,
  });
}

function isRollbackPolicy(policyState) {
  return policyState === 'forced_json' || policyState === 'recovery_probe';
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeNullableString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function normalizeNonNegativeInt(value, fallback = 0) {
  const normalized = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(normalized) || normalized < 0) return fallback;
  return normalized;
}

function normalizeNullableRatio(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return null;
  if (normalized <= 0) return 0;
  if (normalized >= 1) return 1;
  return +normalized.toFixed(4);
}

function normalizeNullablePercent(value) {
  const normalized = Number(value);
  if (!Number.isFinite(normalized)) return null;
  if (normalized <= 0) return 0;
  if (normalized >= 100) return 100;
  return +normalized.toFixed(2);
}
