import { z } from 'zod';
import { IsoDatetimeSchema, ProviderKeySchema } from './runtime-schemas.js';
import { RuntimeAvailabilityStatusSchema, StorageResilienceStatusSchema } from './resilience-schemas.js';
import { ShellSummarySchema } from './shell-schemas.js';
import { ProviderExtensibilityInventorySchema } from './provider-extensibility-schemas.js';

export const RuntimeFallbackActionSchema = z.enum([
  'continue_with_primary_storage',
  'continue_with_fallback_storage',
  'retry_primary_storage',
  'switch_provider',
  'manual_recovery',
]);

export const RuntimeStorageFallbackModeSchema = z.enum([
  'none',
  'json_backup',
  'shadow_write',
  'unavailable',
]);

export const RuntimeProviderFallbackRoleSchema = z.enum([
  'active_lead',
  'fallback',
  'local_model_fallback',
  'recovery_only',
]);

export const RuntimeFallbackStorageSchema = StorageResilienceStatusSchema.extend({
  fallbackMode: RuntimeStorageFallbackModeSchema,
  availableActions: z.array(RuntimeFallbackActionSchema),
}).strict();

export const RuntimeFallbackProviderCandidateSchema = z.object({
  provider: ProviderKeySchema,
  status: RuntimeAvailabilityStatusSchema,
  role: RuntimeProviderFallbackRoleSchema,
  priority: z.number().int().positive(),
  currentModel: z.string().nullable(),
  defaultModel: z.string().nullable(),
  supportsCustomModels: z.boolean(),
  supportsLocalModels: z.boolean(),
  reasons: z.array(z.string().min(1)),
}).strict();

export const RuntimeFallbackProvidersSchema = z.object({
  lead: ProviderKeySchema.nullable(),
  leadStatus: RuntimeAvailabilityStatusSchema.nullable(),
  readyCount: z.number().int().nonnegative(),
  degradedCount: z.number().int().nonnegative(),
  offlineCount: z.number().int().nonnegative(),
  localModelCapableCount: z.number().int().nonnegative(),
  candidates: z.array(RuntimeFallbackProviderCandidateSchema),
}).strict();

export const RuntimeFallbackInventorySchema = z.object({
  generatedAt: IsoDatetimeSchema,
  offlineReady: z.boolean(),
  summary: z.object({
    storageOffline: z.boolean(),
    fallbackCandidateCount: z.number().int().nonnegative(),
    localModelFallbackCount: z.number().int().nonnegative(),
    providerOfflineCount: z.number().int().nonnegative(),
  }).strict(),
  storage: RuntimeFallbackStorageSchema,
  providers: RuntimeFallbackProvidersSchema,
}).strict();

export function parseRuntimeFallbackInventory(input) {
  return RuntimeFallbackInventorySchema.parse(input);
}

export function buildRuntimeFallbackInventory({
  shellSummary,
  providerExtensibility,
  now = new Date().toISOString(),
} = {}) {
  const shell = ShellSummarySchema.parse(shellSummary || {});
  const inventory = ProviderExtensibilityInventorySchema.parse(providerExtensibility || {});
  const lead = normalizeProviderId(shell.session.lead);
  const storage = buildStorageFallback(shell.storage);
  const providers = buildProviderFallbacks({
    lead,
    shellSummary: shell,
    providerExtensibility: inventory,
  });
  const fallbackCandidateCount = providers.candidates.filter((candidate) =>
    candidate.provider !== lead && candidate.status !== 'offline'
  ).length;
  const localModelFallbackCount = providers.candidates.filter((candidate) =>
    candidate.provider !== lead && candidate.status !== 'offline' && candidate.supportsLocalModels
  ).length;
  const offlineReady = storage.status !== 'offline' && providers.candidates.some((candidate) => candidate.status !== 'offline');

  return parseRuntimeFallbackInventory({
    generatedAt: now,
    offlineReady,
    summary: {
      storageOffline: storage.status === 'offline',
      fallbackCandidateCount,
      localModelFallbackCount,
      providerOfflineCount: providers.offlineCount,
    },
    storage,
    providers,
  });
}

function buildStorageFallback(storage) {
  let fallbackMode = 'none';
  const availableActions = [];

  if (storage.status === 'offline') {
    fallbackMode = 'unavailable';
    availableActions.push('manual_recovery');
  } else if (storage.effectiveMode === 'json-backup') {
    fallbackMode = 'json_backup';
    availableActions.push('continue_with_fallback_storage', 'retry_primary_storage');
  } else if (storage.shadow || storage.failover) {
    fallbackMode = 'shadow_write';
    availableActions.push('continue_with_fallback_storage', 'retry_primary_storage');
  } else {
    availableActions.push('continue_with_primary_storage');
  }

  return RuntimeFallbackStorageSchema.parse({
    status: storage.status,
    effectiveMode: storage.effectiveMode,
    policyState: storage.policyState,
    failureRatio: storage.failureRatio,
    reasons: storage.reasons,
    fallbackMode,
    availableActions,
  });
}

function buildProviderFallbacks({ lead, shellSummary, providerExtensibility }) {
  const shellCards = new Map(shellSummary.providers.cards.map((card) => [card.provider, card]));
  const candidates = providerExtensibility.providers
    .map((provider) => {
      const card = shellCards.get(provider.provider) || null;
      const status = card?.status || 'offline';
      const reasons = [];

      if (provider.provider === lead) {
        reasons.push('current_lead');
      }
      if (status === 'ready') {
        reasons.push('runtime_ready');
      } else if (status === 'degraded') {
        reasons.push('runtime_degraded');
      } else {
        reasons.push('runtime_offline');
      }
      if (provider.supportsLocalModels) {
        reasons.push('local_model_capable');
      }
      if (provider.supportsCustomModels) {
        reasons.push('custom_model_capable');
      }

      return {
        provider: provider.provider,
        status,
        role: resolveProviderRole(provider.provider, lead, status, provider),
        priority: computeCandidateScore(provider.provider, lead, status, provider),
        currentModel: shellSummary.providers.models[provider.provider] || null,
        defaultModel: provider.defaultModel,
        supportsCustomModels: provider.supportsCustomModels,
        supportsLocalModels: provider.supportsLocalModels,
        reasons,
      };
    })
    .sort((left, right) => {
      if (right.priority !== left.priority) {
        return right.priority - left.priority;
      }
      return left.provider.localeCompare(right.provider);
    })
    .map((candidate, index) => RuntimeFallbackProviderCandidateSchema.parse({
      ...candidate,
      priority: index + 1,
    }));

  const leadCandidate = candidates.find((candidate) => candidate.provider === lead) || null;

  return RuntimeFallbackProvidersSchema.parse({
    lead,
    leadStatus: leadCandidate?.status || null,
    readyCount: candidates.filter((candidate) => candidate.status === 'ready').length,
    degradedCount: candidates.filter((candidate) => candidate.status === 'degraded').length,
    offlineCount: candidates.filter((candidate) => candidate.status === 'offline').length,
    localModelCapableCount: candidates.filter((candidate) => candidate.supportsLocalModels && candidate.status !== 'offline').length,
    candidates,
  });
}

function resolveProviderRole(provider, lead, status, metadata) {
  if (provider === lead && status !== 'offline') {
    return 'active_lead';
  }
  if (metadata.supportsLocalModels && status !== 'offline') {
    return 'local_model_fallback';
  }
  if (status === 'ready') {
    return 'fallback';
  }
  return 'recovery_only';
}

function computeCandidateScore(provider, lead, status, metadata) {
  let score = 0;

  if (status === 'ready') score += 50;
  if (status === 'degraded') score += 20;
  if (provider === lead && status === 'ready') score += 10;
  if (provider === lead && status === 'degraded') score += 5;
  if (metadata.supportsLocalModels) score += 20;
  if (metadata.supportsCustomModels) score += 5;

  return score;
}

function normalizeProviderId(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized && ProviderKeySchema.safeParse(normalized).success ? normalized : null;
}
