import { z } from 'zod';
import { IsoDatetimeSchema, ProviderKeySchema } from './runtime-schemas.js';

export const OnboardingReadinessSchema = z.enum(['ready', 'needs_setup', 'unavailable']);
export const ProviderValidationStatusSchema = z.enum(['valid', 'warning', 'invalid']);

export const ProviderDetectionDetailsSchema = z.object({
  cli: z.boolean(),
  configDirs: z.boolean(),
  apiKeys: z.boolean(),
  custom: z.boolean(),
}).strict();

export const ProviderValidationSchema = z.object({
  status: ProviderValidationStatusSchema,
  message: z.string().min(1),
  details: z.record(z.unknown()).optional(),
}).strict();

export const ProviderProbeSchema = z.object({
  id: ProviderKeySchema,
  name: z.string().min(1),
  available: z.boolean(),
  readiness: OnboardingReadinessSchema,
  ctxConfigured: z.boolean(),
  canConfigure: z.boolean(),
  statusLine: z.string().min(1),
  reason: z.string().min(1),
  detection: z.object({
    reason: z.string().min(1),
    details: ProviderDetectionDetailsSchema,
  }).strict(),
  validation: ProviderValidationSchema,
}).strict();

export const WizardCheckpointStageSchema = z.enum([
  'detected',
  'selection',
  'configuration',
  'tutorial_offer',
]);

const WizardStateBaseSchema = z.object({
  version: z.literal(1).default(1),
  checkpointStage: WizardCheckpointStageSchema.default('detected'),
  configuredProviders: z.array(ProviderKeySchema).default([]),
  pendingProviders: z.array(ProviderKeySchema).default([]),
  detectedProviders: z.array(ProviderKeySchema).default([]),
  currentProvider: ProviderKeySchema.nullable().default(null),
  lastUpdated: IsoDatetimeSchema,
}).strict();

export const WizardStateSchema = WizardStateBaseSchema.transform(normalizeWizardState);

export function parseProviderProbe(input) {
  return ProviderProbeSchema.parse(input);
}

export function parseWizardState(input) {
  return WizardStateSchema.parse(migrateWizardState(input));
}

export function createWizardStateSnapshot(input = {}) {
  return parseWizardState({
    version: 1,
    checkpointStage: 'detected',
    configuredProviders: [],
    pendingProviders: [],
    detectedProviders: [],
    currentProvider: null,
    lastUpdated: new Date().toISOString(),
    ...input,
  });
}

export function reconcileWizardState(state, providers) {
  const parsedState = parseWizardState(state);
  const availableProviderIds = providers
    .filter((provider) => provider.available)
    .map((provider) => provider.id);
  const availableProviderSet = new Set(availableProviderIds);
  const unconfiguredAvailableProviders = availableProviderIds.filter(
    (providerId) => !parsedState.configuredProviders.includes(providerId)
  );
  const droppedPendingProviders = parsedState.pendingProviders.filter(
    (providerId) => !availableProviderSet.has(providerId)
  );

  const nextPendingProviders = parsedState.pendingProviders.filter(
    (providerId) => availableProviderSet.has(providerId)
  );

  let requeuedProviderId = null;
  if (
    parsedState.checkpointStage === 'configuration'
    && parsedState.currentProvider
    && availableProviderSet.has(parsedState.currentProvider)
  ) {
    if (!nextPendingProviders.includes(parsedState.currentProvider)) {
      nextPendingProviders.unshift(parsedState.currentProvider);
    }
    requeuedProviderId = parsedState.currentProvider;
  }

  let checkpointStage = parsedState.checkpointStage;
  if (checkpointStage === 'configuration') {
    checkpointStage = nextPendingProviders.length > 0 ? 'selection' : 'detected';
  } else if (checkpointStage === 'selection' && nextPendingProviders.length === 0) {
    checkpointStage = unconfiguredAvailableProviders.length > 0
      ? 'selection'
      : (parsedState.configuredProviders.length > 0 ? 'tutorial_offer' : 'detected');
  } else if (checkpointStage === 'tutorial_offer' && nextPendingProviders.length > 0) {
    checkpointStage = 'selection';
  } else if (checkpointStage === 'tutorial_offer' && unconfiguredAvailableProviders.length > 0) {
    checkpointStage = 'selection';
  }

  const nextState = createWizardStateSnapshot({
    ...parsedState,
    checkpointStage,
    pendingProviders: nextPendingProviders,
    detectedProviders: availableProviderIds,
    currentProvider: null,
    lastUpdated: new Date().toISOString(),
  });

  return {
    state: nextState,
    droppedPendingProviders,
    requeuedProviderId,
  };
}

function migrateWizardState(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return input;
  }

  if ('version' in input) {
    return input;
  }

  if ('configuredProviders' in input) {
    return {
      version: 1,
      checkpointStage: 'selection',
      configuredProviders: input.configuredProviders,
      pendingProviders: input.pendingProviders || [],
      detectedProviders: input.detectedProviders || [],
      currentProvider: input.currentProvider || null,
      lastUpdated: input.lastUpdated || new Date().toISOString(),
    };
  }

  return input;
}

function normalizeWizardState(state) {
  const configuredProviders = dedupeProviders(state.configuredProviders);
  const detectedProviders = dedupeProviders(state.detectedProviders);
  const pendingProviders = dedupeProviders(state.pendingProviders).filter(
    (providerId) => !configuredProviders.includes(providerId)
  );

  let currentProvider = state.currentProvider;
  if (currentProvider && configuredProviders.includes(currentProvider)) {
    currentProvider = null;
  }

  const normalizedPendingProviders = currentProvider && !pendingProviders.includes(currentProvider)
    ? [currentProvider, ...pendingProviders]
    : pendingProviders;

  return {
    ...state,
    configuredProviders,
    pendingProviders: normalizedPendingProviders,
    detectedProviders,
    currentProvider,
  };
}

function dedupeProviders(providerIds) {
  return [...new Set(providerIds)];
}
