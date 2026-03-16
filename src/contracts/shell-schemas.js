import { z } from 'zod';
import { ProviderKeySchema } from './runtime-schemas.js';
import {
  RuntimeAvailabilityStatusSchema,
  buildProviderResilienceStatus,
  buildStorageResilienceStatus,
} from './resilience-schemas.js';

const NullableStringSchema = z.string().nullable().default(null);

export const ShellSessionSummarySchema = z.object({
  stage: z.string().default('idle'),
  lead: z.string().default('codex'),
  task: z.string().nullable().default(null),
  updatedAt: NullableStringSchema,
}).strict();

export const ShellProjectSummarySchema = z.object({
  name: z.string().default(''),
  branch: z.string().default(''),
  stackLabel: z.string().default(''),
}).strict();

export const ShellStorageSourceSchema = z.object({
  source: z.string(),
  channel: z.string().optional(),
  backing: z.string().optional(),
  mode: z.string().optional(),
  failover: z.boolean().optional(),
  shadow: z.boolean().optional(),
  path: z.string().optional(),
  migration: z.string().optional(),
}).passthrough();

export const ShellStorageSummarySchema = z.object({
  status: RuntimeAvailabilityStatusSchema.default('offline'),
  mode: z.string().default('unknown'),
  effectiveMode: z.string().default('unknown'),
  policyState: NullableStringSchema,
  failureRatio: z.number().min(0).max(1).nullable().default(null),
  failover: z.boolean().default(false),
  shadow: z.boolean().default(false),
  warningActive: z.boolean().default(false),
  reasons: z.array(z.string()).default([]),
  sourceCount: z.number().int().nonnegative().default(0),
  sources: z.record(ShellStorageSourceSchema).default({}),
  ts: NullableStringSchema,
}).passthrough();

export const ShellProviderCardSchema = z.object({
  provider: ProviderKeySchema,
  status: RuntimeAvailabilityStatusSchema.default('offline'),
  model: z.string().nullable().default(null),
  calls: z.number().int().nonnegative().default(0),
  successes: z.number().int().nonnegative().default(0),
  failures: z.number().int().nonnegative().default(0),
  consecutiveFailures: z.number().int().nonnegative().default(0),
  circuitOpen: z.boolean().default(false),
  successRate: z.number().min(0).max(100).default(0),
  avgLatencyMs: z.number().nonnegative().default(0),
  lastLatencyMs: z.number().nonnegative().default(0),
  lastSuccess: NullableStringSchema,
  lastFailure: NullableStringSchema,
  updatedAt: NullableStringSchema,
  hasTelemetry: z.boolean().default(false),
  reasons: z.array(z.string()).default([]),
}).strict();

export const ShellProvidersSummarySchema = z.object({
  models: z.record(z.string()).default({}),
  cards: z.array(ShellProviderCardSchema).default([]),
}).strict();

export const ShellSummarySchema = z.object({
  session: ShellSessionSummarySchema,
  project: ShellProjectSummarySchema,
  storage: ShellStorageSummarySchema,
  providers: ShellProvidersSummarySchema,
}).strict();

export function parseShellSummary(input) {
  return ShellSummarySchema.parse(input);
}

export function createShellSummary(snapshot = {}) {
  const pipeline = asRecord(snapshot.pipeline);
  const project = asRecord(snapshot.project);
  const storageHealth = asRecord(snapshot.storageHealth);
  const providerHealth = asRecord(snapshot.providerHealth);
  const models = normalizeModels(pipeline.models);
  const sourceCount = Object.keys(asRecord(storageHealth.sources)).length;
  const storageStatus = buildStorageResilienceStatus(storageHealth, { sourceCount });
  const providerIds = [...new Set([
    ...Object.keys(models),
    ...Object.keys(providerHealth).filter((provider) => normalizeProviderId(provider)),
  ])].sort();

  return parseShellSummary({
    session: {
      stage: normalizeString(pipeline.stage, 'idle'),
      lead: normalizeString(pipeline.lead, 'codex'),
      task: normalizeNullableString(pipeline.task),
      updatedAt: normalizeNullableString(pipeline.updatedAt),
    },
    project: {
      name: normalizeString(project.name ?? project.project, ''),
      branch: resolveProjectBranch(project),
      stackLabel: formatProjectStack(project.stack),
    },
    storage: {
      status: storageStatus.status,
      mode: normalizeString(storageHealth.mode, 'unknown'),
      effectiveMode: normalizeString(storageHealth.effectiveMode, normalizeString(storageHealth.mode, 'unknown')),
      policyState: normalizeNullableString(storageHealth.policyState ?? storageHealth.policy?.effectiveState),
      failureRatio: normalizeNullableNumber(storageHealth.failureRatio ?? storageHealth.totals?.failureRatio),
      failover: normalizeBoolean(storageHealth.failover),
      shadow: normalizeBoolean(storageHealth.shadow),
      warningActive: normalizeBoolean(storageHealth.warningActive),
      reasons: storageStatus.reasons,
      sourceCount,
      sources: normalizeSources(storageHealth.sources),
      ts: normalizeNullableString(storageHealth.ts),
    },
    providers: {
      models,
      cards: providerIds
        .map((provider) => buildProviderCard(provider, models[provider] ?? null, providerHealth[provider]))
        .filter(Boolean),
    },
  });
}

function buildProviderCard(provider, model, rawHealth) {
  const normalizedProvider = normalizeProviderId(provider);
  if (!normalizedProvider) {
    return null;
  }

  const health = asRecord(rawHealth);
  const calls = normalizeCount(health.calls);
  const successes = normalizeCount(health.successes);
  const failures = normalizeCount(health.totalFailures ?? health.failures);
  const successRate = clamp(
    normalizeNumber(
      health.successRate,
      calls > 0 ? (successes / calls) * 100 : 0
    ),
    0,
    100
  );
  const avgLatencyMs = clamp(normalizeNumber(health.avgLatencyMs, normalizeNumber(health.lastLatencyMs, 0)), 0);
  const lastLatencyMs = clamp(normalizeNumber(health.lastLatencyMs, avgLatencyMs), 0);
  const consecutiveFailures = normalizeCount(health.failures);
  const resilience = buildProviderResilienceStatus(normalizedProvider, {
    model,
    hasTelemetry: calls > 0 || successes > 0 || failures > 0 || avgLatencyMs > 0 || lastLatencyMs > 0,
    successRate,
    failures: consecutiveFailures,
  });

  return ShellProviderCardSchema.parse({
    provider: normalizedProvider,
    status: resilience.status,
    model: normalizeNullableString(model),
    calls,
    successes,
    failures,
    consecutiveFailures: resilience.consecutiveFailures,
    circuitOpen: resilience.circuitOpen,
    successRate,
    avgLatencyMs,
    lastLatencyMs,
    lastSuccess: normalizeNullableString(health.lastSuccess),
    lastFailure: normalizeNullableString(health.lastFailure),
    updatedAt: normalizeNullableString(health.updatedAt),
    hasTelemetry: calls > 0 || successes > 0 || failures > 0 || avgLatencyMs > 0 || lastLatencyMs > 0,
    reasons: resilience.reasons,
  });
}

function normalizeModels(value) {
  const record = asRecord(value);
  const models = {};
  for (const [provider, model] of Object.entries(record)) {
    const normalizedProvider = normalizeProviderId(provider);
    const normalizedModel = normalizeString(model, '');
    if (normalizedProvider && normalizedModel) {
      models[normalizedProvider] = normalizedModel;
    }
  }
  return models;
}

function normalizeSources(value) {
  const record = asRecord(value);
  const sources = {};
  for (const [name, source] of Object.entries(record)) {
    if (!name || !isRecord(source)) continue;
    sources[name] = ShellStorageSourceSchema.parse(source);
  }
  return sources;
}

function resolveProjectBranch(project) {
  const git = asRecord(project.git);
  return normalizeString(
    git.branch
      ?? git.currentBranch
      ?? project.branch
      ?? project.currentBranch,
    ''
  );
}

function formatProjectStack(stack) {
  if (typeof stack === 'string') {
    return stack.trim();
  }

  if (Array.isArray(stack)) {
    return stack.map((part) => normalizeString(part, '')).filter(Boolean).join(', ');
  }

  if (!isRecord(stack)) {
    return '';
  }

  if (typeof stack.primary === 'string' && stack.primary.trim()) {
    return stack.primary.trim();
  }

  return Object.keys(stack).slice(0, 3).join(', ');
}

function normalizeProviderId(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized && ProviderKeySchema.safeParse(normalized).success ? normalized : null;
}

function normalizeCount(value) {
  return Math.max(0, Math.floor(normalizeNumber(value, 0)));
}

function normalizeNumber(value, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeNullableNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeNullableString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function clamp(value, min, max = Number.POSITIVE_INFINITY) {
  return Math.min(max, Math.max(min, value));
}

function asRecord(value) {
  return isRecord(value) ? value : {};
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
