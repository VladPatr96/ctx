import { z } from 'zod';
import { ProviderKeySchema, IsoDatetimeSchema } from './runtime-schemas.js';
import { RuntimeAvailabilityStatusSchema } from './resilience-schemas.js';
import { ProviderExtensibilityInventorySchema } from './provider-extensibility-schemas.js';
import {
  AbortActionSchema,
  ExecutionTransportSchema,
  ProviderAdapterSchema,
  ProviderLifecycleHookNameSchema,
} from '../providers/provider-modes.js';
import { ShellSummarySchema } from './shell-schemas.js';
import {
  RuntimeFallbackInventorySchema,
  RuntimeProviderFallbackRoleSchema,
} from './runtime-fallback-schemas.js';

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
