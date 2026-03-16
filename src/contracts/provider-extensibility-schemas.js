import { z } from 'zod';
import {
  ExecutionModeSchema,
  IsoDatetimeSchema,
  ProviderKeySchema,
} from './runtime-schemas.js';
import {
  ExecutionTransportSchema,
  ProviderAdapterSchema,
  ProviderCapabilitySchema,
  ProviderLifecycleContractSchema,
} from '../providers/provider-modes.js';

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
