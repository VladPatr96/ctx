import { z } from 'zod';
import { IsoDatetimeSchema, ProviderKeySchema } from './runtime-schemas.js';
import { RuntimeAvailabilityStatusSchema } from './resilience-schemas.js';
import { ShellSummarySchema } from './shell-schemas.js';
import {
  ProviderRecoveryInventorySchema,
  ProviderRecoveryActionSchema,
} from './provider-recovery-schemas.js';
import {
  RuntimeFallbackActionSchema,
  RuntimeFallbackInventorySchema,
} from './runtime-fallback-schemas.js';

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
