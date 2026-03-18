import { z } from 'zod';
import { IsoDatetimeSchema, ProviderKeySchema, RuntimeAvailabilityStatusSchema } from './runtime-schemas.js';
import { ShellSummarySchema } from './shell-schemas.js';
import { ProviderExtensibilityInventorySchema } from './provider-schemas.js';
import {
  AbortActionSchema,
  ExecutionTransportSchema,
  ProviderAdapterSchema,
  ProviderLifecycleHookNameSchema,
} from '../providers/provider-modes.js';

// ─── resilience-schemas ───────────────────────────────────────────────────────

// Re-export from runtime-schemas.js (to avoid breaking external imports)
export { RuntimeAvailabilityStatusSchema } from './runtime-schemas.js';

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

// ─── runtime-fallback-schemas ─────────────────────────────────────────────────

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

// ─── provider-recovery-schemas ────────────────────────────────────────────────

export const ProviderRecoveryActionSchema = z.enum([
  'continue_with_provider',
  'retry_request',
  'restart_subprocess_session',
  'wait_for_circuit_reset',
  'switch_to_fallback_provider',
  'switch_to_local_model_provider',
  'resume_checkpointed_session',
  'manual_reconfigure_provider',
]);

export const ProviderOutageLevelSchema = z.enum(['none', 'degraded', 'offline']);

export const ProviderRecoveryHooksSchema = z.object({
  lifecycleHooks: z.array(ProviderLifecycleHookNameSchema),
  timeoutAction: AbortActionSchema,
  cleanupScope: z.enum(['none', 'process', 'session', 'workspace']),
  supportsCheckpointing: z.boolean(),
  supportsSuspend: z.boolean(),
}).strict();

export const ProviderRecoveryPlanSchema = z.object({
  provider: ProviderKeySchema,
  status: RuntimeAvailabilityStatusSchema,
  outageLevel: ProviderOutageLevelSchema,
  adapter: ProviderAdapterSchema,
  executionTransport: ExecutionTransportSchema,
  currentModel: z.string().nullable(),
  defaultModel: z.string().nullable(),
  fallbackProvider: ProviderKeySchema.nullable(),
  fallbackRole: RuntimeProviderFallbackRoleSchema.nullable(),
  recommendedAction: ProviderRecoveryActionSchema,
  availableActions: z.array(ProviderRecoveryActionSchema),
  reasons: z.array(z.string().min(1)),
  hooks: ProviderRecoveryHooksSchema,
}).strict();

export const ProviderRecoveryInventorySchema = z.object({
  generatedAt: IsoDatetimeSchema,
  summary: z.object({
    totalProviders: z.number().int().nonnegative(),
    actionableProviders: z.number().int().nonnegative(),
    degradedProviders: z.number().int().nonnegative(),
    offlineProviders: z.number().int().nonnegative(),
    localModelRecoveryOptions: z.number().int().nonnegative(),
  }).strict(),
  providers: z.array(ProviderRecoveryPlanSchema),
}).strict();

export function parseProviderRecoveryInventory(input) {
  return ProviderRecoveryInventorySchema.parse(input);
}

export function buildProviderRecoveryInventory({
  shellSummary,
  providerExtensibility,
  runtimeFallbacks,
  now = new Date().toISOString(),
} = {}) {
  const shell = ShellSummarySchema.parse(shellSummary || {});
  const extensibility = ProviderExtensibilityInventorySchema.parse(providerExtensibility || {});
  const fallbacks = RuntimeFallbackInventorySchema.parse(runtimeFallbacks || {});

  const providers = extensibility.providers
    .map((provider) => buildProviderRecoveryPlan({
      provider,
      shellSummary: shell,
      runtimeFallbacks: fallbacks,
    }))
    .sort((left, right) => left.provider.localeCompare(right.provider));

  return parseProviderRecoveryInventory({
    generatedAt: now,
    summary: {
      totalProviders: providers.length,
      actionableProviders: providers.filter((provider) => provider.outageLevel !== 'none').length,
      degradedProviders: providers.filter((provider) => provider.outageLevel === 'degraded').length,
      offlineProviders: providers.filter((provider) => provider.outageLevel === 'offline').length,
      localModelRecoveryOptions: providers.filter((provider) =>
        provider.availableActions.includes('switch_to_local_model_provider')
      ).length,
    },
    providers,
  });
}

function buildProviderRecoveryPlan({ provider, shellSummary, runtimeFallbacks }) {
  const card = shellSummary.providers.cards.find((candidate) => candidate.provider === provider.provider) || null;
  const fallbackCandidate = runtimeFallbacks.providers.candidates.find((candidate) =>
    candidate.provider !== provider.provider && candidate.status !== 'offline'
  ) || null;
  const status = card?.status || 'offline';
  const outageLevel = status === 'degraded' || status === 'offline' ? status : 'none';
  const reasons = normalizeReasons(card?.reasons);
  const availableActions = determineAvailableActions({
    provider,
    outageLevel,
    reasons,
    fallbackCandidate,
  });
  const recommendedAction = availableActions[0];

  return ProviderRecoveryPlanSchema.parse({
    provider: provider.provider,
    status,
    outageLevel,
    adapter: provider.adapter,
    executionTransport: provider.executionTransport,
    currentModel: shellSummary.providers.models[provider.provider] || null,
    defaultModel: provider.defaultModel,
    fallbackProvider: fallbackCandidate?.provider || null,
    fallbackRole: fallbackCandidate?.role || null,
    recommendedAction,
    availableActions,
    reasons,
    hooks: {
      lifecycleHooks: provider.lifecycle.hooks,
      timeoutAction: provider.lifecycle.timeoutAction,
      cleanupScope: provider.lifecycle.cleanupScope,
      supportsCheckpointing: provider.lifecycle.supportsCheckpointing,
      supportsSuspend: provider.lifecycle.supportsSuspend,
    },
  });
}

function determineAvailableActions({ provider, outageLevel, reasons, fallbackCandidate }) {
  if (outageLevel === 'none') {
    return ['continue_with_provider'];
  }

  const actions = [];

  if (fallbackCandidate?.supportsLocalModels) {
    actions.push('switch_to_local_model_provider');
  } else if (fallbackCandidate) {
    actions.push('switch_to_fallback_provider');
  }

  if (reasons.includes('provider_unconfigured')) {
    actions.push('manual_reconfigure_provider');
  }

  if (reasons.includes('provider_circuit_open')) {
    actions.push('wait_for_circuit_reset');
  }

  if (provider.executionTransport === 'subprocess') {
    actions.push('restart_subprocess_session');
  }

  if (outageLevel === 'degraded') {
    actions.push('retry_request');
  }

  if (provider.lifecycle.supportsCheckpointing) {
    actions.push('resume_checkpointed_session');
  }

  if (actions.length === 0) {
    actions.push(outageLevel === 'offline' ? 'manual_reconfigure_provider' : 'retry_request');
  }

  return dedupeActions(actions);
}

function normalizeReasons(reasons) {
  if (!Array.isArray(reasons) || reasons.length === 0) {
    return ['provider_unconfigured'];
  }

  return reasons
    .map((reason) => String(reason || '').trim())
    .filter(Boolean);
}

function dedupeActions(actions) {
  return [...new Set(actions)];
}

// ─── resilience-audit-schemas ─────────────────────────────────────────────────

export const ResilienceAuditScopeSchema = z.enum(['storage', 'provider']);
export const ResilienceAuditTargetSchema = z.union([z.literal('storage'), ProviderKeySchema]);
export const ResilienceAuditTransitionSchema = z.enum([
  'degraded_entered',
  'offline_entered',
  'recovered',
]);
export const ResilienceAuditSeveritySchema = z.enum(['info', 'warning', 'critical']);
export const ResilienceThrottleModeSchema = z.enum([
  'serialize_requests',
  'shift_to_fallback',
  'prefer_local_models',
  'pause_mutations',
  'manual_only',
]);
export const ResilienceNotificationKindSchema = z.enum([
  'operator_banner',
  'operator_notice',
  'recovery_notice',
  'throttle_recommendation',
]);
export const ResilienceAuditActionSchema = z.enum([
  'continue_with_provider',
  'retry_request',
  'restart_subprocess_session',
  'wait_for_circuit_reset',
  'switch_to_fallback_provider',
  'switch_to_local_model_provider',
  'resume_checkpointed_session',
  'manual_reconfigure_provider',
  'continue_with_primary_storage',
  'continue_with_fallback_storage',
  'retry_primary_storage',
  'switch_provider',
  'manual_recovery',
]);

export const ResilienceAuditEventSchema = z.object({
  id: z.string().min(1),
  scope: ResilienceAuditScopeSchema,
  target: ResilienceAuditTargetSchema,
  status: RuntimeAvailabilityStatusSchema,
  transition: ResilienceAuditTransitionSchema,
  severity: ResilienceAuditSeveritySchema,
  recordedAt: IsoDatetimeSchema,
  reasons: z.array(z.string().min(1)),
  recommendedAction: ResilienceAuditActionSchema.nullable(),
}).strict();

export const ResilienceNotificationSchema = z.object({
  id: z.string().min(1),
  kind: ResilienceNotificationKindSchema,
  severity: ResilienceAuditSeveritySchema,
  scope: ResilienceAuditScopeSchema,
  target: ResilienceAuditTargetSchema,
  title: z.string().min(1),
  message: z.string().min(1),
  suggestedAction: ResilienceAuditActionSchema.nullable(),
  throttleMode: ResilienceThrottleModeSchema.nullable(),
  eventIds: z.array(z.string().min(1)),
}).strict();

export const ResilienceThrottleHintSchema = z.object({
  id: z.string().min(1),
  scope: ResilienceAuditScopeSchema,
  target: ResilienceAuditTargetSchema,
  mode: ResilienceThrottleModeSchema,
  reason: z.string().min(1),
  action: ResilienceAuditActionSchema.nullable(),
  eventIds: z.array(z.string().min(1)),
}).strict();

export const ResilienceAuditInventorySchema = z.object({
  generatedAt: IsoDatetimeSchema,
  summary: z.object({
    totalEvents: z.number().int().nonnegative(),
    openIncidents: z.number().int().nonnegative(),
    recoveryEvents: z.number().int().nonnegative(),
    notifications: z.number().int().nonnegative(),
    throttles: z.number().int().nonnegative(),
    offlineProviders: z.number().int().nonnegative(),
    degradedProviders: z.number().int().nonnegative(),
    storageStatus: RuntimeAvailabilityStatusSchema,
  }).strict(),
  events: z.array(ResilienceAuditEventSchema),
  notifications: z.array(ResilienceNotificationSchema),
  throttles: z.array(ResilienceThrottleHintSchema),
}).strict();

export function parseResilienceAuditInventory(input) {
  return ResilienceAuditInventorySchema.parse(input);
}

export function buildResilienceAuditInventory({
  shellSummary,
  providerRecovery,
  runtimeFallbacks,
  now = new Date().toISOString(),
} = {}) {
  const shell = ShellSummarySchema.parse(shellSummary || {});
  const recovery = ProviderRecoveryInventorySchema.parse(providerRecovery || {});
  const fallbacks = RuntimeFallbackInventorySchema.parse(runtimeFallbacks || {});

  const providerCards = new Map(shell.providers.cards.map((card) => [card.provider, card]));
  const providerPlans = new Map(recovery.providers.map((plan) => [plan.provider, plan]));
  const events = [];

  const storageEvent = buildStorageAuditEvent(shell.storage, fallbacks.storage, now);
  if (storageEvent) {
    events.push(storageEvent);
  }

  for (const [provider, plan] of providerPlans.entries()) {
    const providerEvent = buildProviderAuditEvent(plan, providerCards.get(provider) || null, now);
    if (providerEvent) {
      events.push(providerEvent);
    }
  }

  const throttles = buildThrottleHints({
    storage: shell.storage,
    providerCards,
    providerPlans,
    storageEvent,
    now,
  });
  const notifications = buildNotifications({
    events,
    throttles,
  });

  return parseResilienceAuditInventory({
    generatedAt: now,
    summary: {
      totalEvents: events.length,
      openIncidents: events.filter((event) => event.transition !== 'recovered').length,
      recoveryEvents: events.filter((event) => event.transition === 'recovered').length,
      notifications: notifications.length,
      throttles: throttles.length,
      offlineProviders: recovery.summary.offlineProviders,
      degradedProviders: recovery.summary.degradedProviders,
      storageStatus: shell.storage.status,
    },
    events,
    notifications,
    throttles,
  });
}

function buildStorageAuditEvent(storage, fallbackStorage, now) {
  if (storage.status === 'offline') {
    return ResilienceAuditEventSchema.parse({
      id: 'storage:offline_entered',
      scope: 'storage',
      target: 'storage',
      status: storage.status,
      transition: 'offline_entered',
      severity: 'critical',
      recordedAt: normalizeTimestamp(storage.ts, now),
      reasons: storage.reasons.length ? storage.reasons : ['storage_surface_unavailable'],
      recommendedAction: fallbackStorage.availableActions[0] || 'manual_recovery',
    });
  }

  if (storage.status === 'degraded') {
    return ResilienceAuditEventSchema.parse({
      id: 'storage:degraded_entered',
      scope: 'storage',
      target: 'storage',
      status: storage.status,
      transition: 'degraded_entered',
      severity: 'warning',
      recordedAt: normalizeTimestamp(storage.ts, now),
      reasons: storage.reasons.length ? storage.reasons : ['primary_storage_unavailable'],
      recommendedAction: fallbackStorage.availableActions[0] || 'continue_with_fallback_storage',
    });
  }

  if (hasRecoveredStorageSignal(storage)) {
    return ResilienceAuditEventSchema.parse({
      id: 'storage:recovered',
      scope: 'storage',
      target: 'storage',
      status: storage.status,
      transition: 'recovered',
      severity: 'info',
      recordedAt: normalizeTimestamp(storage.ts, now),
      reasons: storage.reasons.length ? storage.reasons : ['primary_storage_restored'],
      recommendedAction: 'continue_with_primary_storage',
    });
  }

  return null;
}

function buildProviderAuditEvent(plan, card, now) {
  if (plan.outageLevel === 'offline') {
    return ResilienceAuditEventSchema.parse({
      id: `provider:${plan.provider}:offline_entered`,
      scope: 'provider',
      target: plan.provider,
      status: plan.status,
      transition: 'offline_entered',
      severity: 'critical',
      recordedAt: pickAuditTimestamp(card?.updatedAt, card?.lastFailure, card?.lastSuccess, now),
      reasons: plan.reasons,
      recommendedAction: plan.recommendedAction,
    });
  }

  if (plan.outageLevel === 'degraded') {
    return ResilienceAuditEventSchema.parse({
      id: `provider:${plan.provider}:degraded_entered`,
      scope: 'provider',
      target: plan.provider,
      status: plan.status,
      transition: 'degraded_entered',
      severity: 'warning',
      recordedAt: pickAuditTimestamp(card?.updatedAt, card?.lastFailure, card?.lastSuccess, now),
      reasons: plan.reasons,
      recommendedAction: plan.recommendedAction,
    });
  }

  if (isRecoveredProvider(card)) {
    return ResilienceAuditEventSchema.parse({
      id: `provider:${plan.provider}:recovered`,
      scope: 'provider',
      target: plan.provider,
      status: plan.status,
      transition: 'recovered',
      severity: 'info',
      recordedAt: pickAuditTimestamp(card?.lastSuccess, card?.updatedAt, now),
      reasons: ['provider_recovered'],
      recommendedAction: 'continue_with_provider',
    });
  }

  return null;
}

function buildThrottleHints({ storage, providerCards, providerPlans, storageEvent }) {
  const hints = [];

  if (storageEvent && storageEvent.transition !== 'recovered') {
    hints.push(ResilienceThrottleHintSchema.parse({
      id: `throttle:storage:${storageEvent.transition}`,
      scope: 'storage',
      target: 'storage',
      mode: storage.status === 'offline' ? 'manual_only' : 'pause_mutations',
      reason: storage.status === 'offline'
        ? 'Storage is offline; keep writes manual until recovery completes.'
        : 'Storage is degraded; reduce mutation pressure while fallback mode is active.',
      action: storage.status === 'offline' ? 'manual_recovery' : 'continue_with_fallback_storage',
      eventIds: [storageEvent.id],
    }));
  }

  for (const [provider, plan] of providerPlans.entries()) {
    const card = providerCards.get(provider) || null;
    const eventId = plan.outageLevel === 'offline'
      ? `provider:${provider}:offline_entered`
      : plan.outageLevel === 'degraded'
        ? `provider:${provider}:degraded_entered`
        : null;

    if (plan.outageLevel === 'offline') {
      hints.push(ResilienceThrottleHintSchema.parse({
        id: `throttle:provider:${provider}:offline`,
        scope: 'provider',
        target: provider,
        mode: plan.fallbackProvider ? 'shift_to_fallback' : 'manual_only',
        reason: plan.fallbackProvider
          ? `Route new work away from ${provider} until outage conditions clear.`
          : `Keep ${provider} in manual recovery mode until it is reconfigured.`,
        action: plan.recommendedAction,
        eventIds: eventId ? [eventId] : [],
      }));
      continue;
    }

    if (plan.outageLevel === 'degraded' && card && card.consecutiveFailures >= 2) {
      const mode = plan.availableActions.includes('switch_to_local_model_provider')
        ? 'prefer_local_models'
        : 'serialize_requests';
      const reason = mode === 'prefer_local_models'
        ? `Repeated failures detected for ${provider}; prefer local-model recovery while the provider is unstable.`
        : `Repeated failures detected for ${provider}; serialize requests until the error rate stabilizes.`;

      hints.push(ResilienceThrottleHintSchema.parse({
        id: `throttle:provider:${provider}:degraded`,
        scope: 'provider',
        target: provider,
        mode,
        reason,
        action: plan.recommendedAction,
        eventIds: eventId ? [eventId] : [],
      }));
    }
  }

  return hints;
}

function buildNotifications({ events, throttles }) {
  const notifications = [];

  for (const event of events) {
    notifications.push(ResilienceNotificationSchema.parse({
      id: `notification:${event.id}`,
      kind: resolveNotificationKind(event.transition, event.severity),
      severity: event.severity,
      scope: event.scope,
      target: event.target,
      title: buildNotificationTitle(event),
      message: buildNotificationMessage(event),
      suggestedAction: event.recommendedAction,
      throttleMode: null,
      eventIds: [event.id],
    }));
  }

  for (const throttle of throttles) {
    notifications.push(ResilienceNotificationSchema.parse({
      id: `notification:${throttle.id}`,
      kind: 'throttle_recommendation',
      severity: throttle.mode === 'manual_only' ? 'critical' : 'warning',
      scope: throttle.scope,
      target: throttle.target,
      title: buildThrottleTitle(throttle),
      message: throttle.reason,
      suggestedAction: throttle.action,
      throttleMode: throttle.mode,
      eventIds: throttle.eventIds,
    }));
  }

  return notifications;
}

function hasRecoveredStorageSignal(storage) {
  return storage.status === 'ready' && (
    storage.failover === true ||
    storage.shadow === true ||
    (typeof storage.failureRatio === 'number' && storage.failureRatio > 0)
  );
}

function isRecoveredProvider(card) {
  if (!card || card.status !== 'ready') {
    return false;
  }
  const lastFailure = Date.parse(String(card.lastFailure || ''));
  const lastSuccess = Date.parse(String(card.lastSuccess || ''));
  return Number.isFinite(lastFailure) && Number.isFinite(lastSuccess) && lastSuccess > lastFailure;
}

function resolveNotificationKind(transition, severity) {
  if (transition === 'recovered') {
    return 'recovery_notice';
  }
  return severity === 'critical' ? 'operator_banner' : 'operator_notice';
}

function buildNotificationTitle(event) {
  const target = event.target === 'storage' ? 'Storage' : capitalize(event.target);

  if (event.transition === 'recovered') {
    return `${target} recovered`;
  }
  if (event.transition === 'offline_entered') {
    return `${target} went offline`;
  }
  return `${target} is degraded`;
}

function buildNotificationMessage(event) {
  if (event.transition === 'recovered') {
    return `${event.target === 'storage' ? 'Storage' : capitalize(event.target)} is back in a ready state.`;
  }
  if (event.recommendedAction) {
    return `Recommended action: ${String(event.recommendedAction).replace(/_/g, ' ')}.`;
  }
  return `Reasons: ${event.reasons.join(', ')}.`;
}

function buildThrottleTitle(throttle) {
  const target = throttle.target === 'storage' ? 'Storage' : capitalize(throttle.target);
  return `${target} throttle: ${String(throttle.mode).replace(/_/g, ' ')}`;
}

function pickAuditTimestamp(...values) {
  for (const value of values) {
    const normalized = normalizeTimestamp(value, null);
    if (normalized) {
      return normalized;
    }
  }
  return new Date().toISOString();
}

function normalizeTimestamp(value, fallback = new Date().toISOString()) {
  if (typeof value !== 'string' || !value.trim()) {
    return fallback;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : fallback;
}

function capitalize(value) {
  return String(value || '').charAt(0).toUpperCase() + String(value || '').slice(1);
}
