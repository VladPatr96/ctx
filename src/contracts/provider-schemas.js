// Merged from:
//   onboarding-schemas.js       — wizard/setup schemas
//   provider-docs-schemas.js    — migration docs schemas
//   provider-extensibility-schemas.js — provider extension schemas

import { z } from 'zod';
import { IsoDatetimeSchema, ProviderKeySchema, ExecutionModeSchema } from './runtime-schemas.js';
import {
  ExecutionTransportSchema,
  ProviderAdapterSchema,
  ProviderCapabilitySchema,
  ProviderLifecycleContractSchema,
} from '../providers/provider-modes.js';

// ─── onboarding-schemas ──────────────────────────────────────────────────────

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

// ─── provider-docs-schemas ───────────────────────────────────────────────────

export const ProviderHostInterfaceSchema = z.enum(['mcp_native', 'cli_wrapper']);

export const ProviderMigrationEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  setupDescription: z.string().min(1),
  hostInterface: ProviderHostInterfaceSchema,
  hostMcpOptional: z.boolean(),
  setupCommand: z.string().min(1),
  preferredInvocation: z.string().min(1),
  configurationSurface: z.string().min(1),
  detectionSignals: z.array(z.string().min(1)).min(1),
  migrationNotes: z.array(z.string().min(1)).min(1),
  sourceDocs: z.array(z.string().min(1)).min(1),
  runtime: z.object({
    mode: ExecutionModeSchema,
    adapter: ProviderAdapterSchema,
    executionTransport: ExecutionTransportSchema,
    supportsCheckpointing: z.boolean(),
    supportsSuspend: z.boolean(),
    timeoutAction: z.string().min(1),
  }).strict(),
}).strict();

export const ProviderMigrationSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  byHostInterface: z.object({
    mcp_native: z.number().int().nonnegative(),
    cli_wrapper: z.number().int().nonnegative(),
  }).strict(),
  byRuntimeMode: z.object({
    api: z.number().int().nonnegative(),
    cli: z.number().int().nonnegative(),
    agent: z.number().int().nonnegative(),
  }).strict(),
  hostMcpOptional: z.number().int().nonnegative(),
}).strict();

export const ProviderMigrationArtifactSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  providers: z.array(ProviderMigrationEntrySchema).min(1),
  summary: ProviderMigrationSummarySchema,
}).strict();

export function parseProviderMigrationArtifact(input) {
  return ProviderMigrationArtifactSchema.parse(input);
}

export function createProviderMigrationArtifact({ generatedAt, providers }) {
  const normalizedProviders = providers.map((provider) => ProviderMigrationEntrySchema.parse(provider));
  const byHostInterface = {
    mcp_native: 0,
    cli_wrapper: 0,
  };
  const byRuntimeMode = {
    api: 0,
    cli: 0,
    agent: 0,
  };

  for (const provider of normalizedProviders) {
    byHostInterface[provider.hostInterface] += 1;
    byRuntimeMode[provider.runtime.mode] += 1;
  }

  return parseProviderMigrationArtifact({
    generatedAt,
    providers: normalizedProviders,
    summary: {
      total: normalizedProviders.length,
      byHostInterface,
      byRuntimeMode,
      hostMcpOptional: normalizedProviders.filter((provider) => provider.hostMcpOptional).length,
    },
  });
}

// ─── provider-extensibility-schemas ─────────────────────────────────────────

export const ProviderDiscoveryInputKindSchema = z.enum([
  'static_catalog',
  'config_file',
  'command',
]);

export const ProviderModelSourceSchema = z.enum([
  'static_catalog',
  'config_file',
  'cli_discovery',
  'hybrid',
]);

export const ProviderPluginSurfaceSchema = z.enum([
  'builtin_provider',
  'configurable_provider',
  'local_model_provider',
]);

export const ProviderExtensibilityLevelSchema = z.enum([
  'builtin_only',
  'configurable',
  'local_model_capable',
]);

export const ProviderDiscoveryInputSchema = z.object({
  kind: ProviderDiscoveryInputKindSchema,
  value: z.string().min(1),
  optional: z.boolean().default(true),
}).strict();

export const ProviderExtensibilityRecordSchema = z.object({
  provider: ProviderKeySchema,
  mode: ExecutionModeSchema,
  adapter: ProviderAdapterSchema,
  transport: z.string().nullable(),
  executionTransport: ExecutionTransportSchema,
  lifecycle: ProviderLifecycleContractSchema,
  capabilities: z.array(ProviderCapabilitySchema),
  notes: z.string().min(1),
  pluginSurface: ProviderPluginSurfaceSchema,
  extensibility: ProviderExtensibilityLevelSchema,
  modelSource: ProviderModelSourceSchema,
  supportsCustomModels: z.boolean(),
  supportsLocalModels: z.boolean(),
  defaultModel: z.string().nullable(),
  modelCount: z.number().int().nonnegative(),
  exampleModels: z.array(z.string()).max(5),
  discoveryInputs: z.array(ProviderDiscoveryInputSchema),
  localModelHints: z.array(z.string()),
}).strict();

export const ProviderExtensibilityInventorySummarySchema = z.object({
  totalProviders: z.number().int().nonnegative(),
  builtinOnly: z.number().int().nonnegative(),
  configurable: z.number().int().nonnegative(),
  localModelCapable: z.number().int().nonnegative(),
}).strict();

export const ProviderExtensibilityInventorySchema = z.object({
  generatedAt: IsoDatetimeSchema,
  summary: ProviderExtensibilityInventorySummarySchema,
  providers: z.array(ProviderExtensibilityRecordSchema),
}).strict();

const PROVIDER_EXTENSIBILITY_METADATA = Object.freeze({
  claude: {
    pluginSurface: 'builtin_provider',
    extensibility: 'builtin_only',
    modelSource: 'static_catalog',
    supportsCustomModels: false,
    supportsLocalModels: false,
    discoveryInputs: [
      { kind: 'static_catalog', value: 'bundled claude wrapper model catalog', optional: false },
    ],
    localModelHints: [],
  },
  gemini: {
    pluginSurface: 'builtin_provider',
    extensibility: 'builtin_only',
    modelSource: 'static_catalog',
    supportsCustomModels: false,
    supportsLocalModels: false,
    discoveryInputs: [
      { kind: 'static_catalog', value: 'bundled gemini wrapper model catalog', optional: false },
    ],
    localModelHints: [],
  },
  codex: {
    pluginSurface: 'configurable_provider',
    extensibility: 'configurable',
    modelSource: 'config_file',
    supportsCustomModels: true,
    supportsLocalModels: false,
    discoveryInputs: [
      { kind: 'config_file', value: '~/.codex/config.toml', optional: true },
      { kind: 'command', value: 'codex exec --model <model>', optional: true },
    ],
    localModelHints: [
      'Custom model ids are admitted through the Codex config and CLI flags.',
    ],
  },
  opencode: {
    pluginSurface: 'local_model_provider',
    extensibility: 'local_model_capable',
    modelSource: 'hybrid',
    supportsCustomModels: true,
    supportsLocalModels: true,
    discoveryInputs: [
      { kind: 'config_file', value: './opencode.json', optional: true },
      { kind: 'command', value: 'opencode models', optional: true },
    ],
    localModelHints: [
      'Local and self-hosted providers are surfaced through OpenCode config and CLI discovery.',
    ],
  },
});

export function parseProviderExtensibilityInventory(input) {
  return ProviderExtensibilityInventorySchema.parse(input);
}

export function createProviderExtensibilityRecord(input) {
  const metadata = resolveProviderExtensibilityMetadata(input.provider);
  const exampleModels = normalizeExampleModels(input.modelInfo?.models);

  return ProviderExtensibilityRecordSchema.parse({
    provider: input.provider,
    mode: input.mode,
    adapter: input.adapter,
    transport: normalizeNullableString(input.transport),
    executionTransport: input.executionTransport,
    lifecycle: input.lifecycle,
    capabilities: normalizeCapabilities(input.capabilities),
    notes: normalizeNotes(input.notes, input.provider),
    pluginSurface: metadata.pluginSurface,
    extensibility: metadata.extensibility,
    modelSource: metadata.modelSource,
    supportsCustomModels: metadata.supportsCustomModels,
    supportsLocalModels: metadata.supportsLocalModels,
    defaultModel: normalizeNullableString(input.modelInfo?.defaultModel),
    modelCount: Array.isArray(input.modelInfo?.models) ? input.modelInfo.models.length : 0,
    exampleModels,
    discoveryInputs: metadata.discoveryInputs,
    localModelHints: metadata.localModelHints,
  });
}

export function buildProviderExtensibilityInventory({
  generatedAt = new Date().toISOString(),
  providers = [],
} = {}) {
  const records = providers
    .map((provider) => createProviderExtensibilityRecord(provider))
    .sort((left, right) => left.provider.localeCompare(right.provider));

  const summary = records.reduce((acc, record) => {
    acc.totalProviders += 1;
    if (record.extensibility === 'builtin_only') acc.builtinOnly += 1;
    if (record.extensibility === 'configurable') acc.configurable += 1;
    if (record.extensibility === 'local_model_capable') acc.localModelCapable += 1;
    return acc;
  }, {
    totalProviders: 0,
    builtinOnly: 0,
    configurable: 0,
    localModelCapable: 0,
  });

  return parseProviderExtensibilityInventory({
    generatedAt,
    summary,
    providers: records,
  });
}

function resolveProviderExtensibilityMetadata(provider) {
  const normalizedProvider = String(provider || '').trim().toLowerCase();
  const metadata = PROVIDER_EXTENSIBILITY_METADATA[normalizedProvider];
  if (metadata) {
    return metadata;
  }

  return {
    pluginSurface: 'builtin_provider',
    extensibility: 'builtin_only',
    modelSource: 'static_catalog',
    supportsCustomModels: false,
    supportsLocalModels: false,
    discoveryInputs: [
      { kind: 'static_catalog', value: `${normalizedProvider || 'runtime'} model catalog`, optional: true },
    ],
    localModelHints: [],
  };
}

function normalizeExampleModels(models) {
  if (!Array.isArray(models)) {
    return [];
  }

  return [...new Set(
    models
      .map((model) => normalizeNullableString(model?.id))
      .filter(Boolean)
  )].slice(0, 5);
}

function normalizeCapabilities(capabilities) {
  if (!Array.isArray(capabilities)) {
    return [];
  }

  return capabilities
    .map((value) => String(value || '').trim())
    .filter(Boolean);
}

function normalizeNotes(value, provider) {
  const normalized = String(value || '').trim();
  if (normalized) {
    return normalized;
  }
  return `${String(provider || 'provider').trim()} extensibility metadata`;
}

function normalizeNullableString(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized || null;
}
