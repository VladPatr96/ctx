import { z } from 'zod';
import { ExecutionModeSchema, ProviderKeySchema } from '../contracts/runtime-schemas.js';

const PROVIDER_CAPABILITY_PATTERN = /^[a-z][a-z0-9_-]*$/;
const LIFECYCLE_HOOK_NAMES = [
  'onTaskStart',
  'onTaskEnd',
  'onStepStart',
  'onStepEnd',
  'onStepTimeout',
  'onAbort',
];

export const ProviderAdapterSchema = z.enum(['ApiAdapter', 'CliAdapter', 'AgentAdapter']);
export const ExecutionTransportSchema = z.enum(['sdk', 'subprocess', 'delegated']);
export const AbortActionSchema = z.enum(['kill', 'graceful_stop', 'suspend']);
export const ProviderCapabilitySchema = z.string()
  .regex(PROVIDER_CAPABILITY_PATTERN, 'Invalid provider capability');
export const ProviderLifecycleHookNameSchema = z.enum(LIFECYCLE_HOOK_NAMES);

export const ProviderLifecycleContractSchema = z.object({
  longRunning: z.boolean(),
  hooks: z.array(ProviderLifecycleHookNameSchema).min(1),
  timeoutAction: AbortActionSchema,
  cleanupScope: z.enum(['none', 'process', 'session', 'workspace']),
  supportsCheckpointing: z.boolean(),
  supportsSuspend: z.boolean(),
}).strict();

export const ProviderModeContractSchema = z.object({
  key: ProviderKeySchema,
  mode: ExecutionModeSchema,
  adapter: ProviderAdapterSchema,
  executionTransport: ExecutionTransportSchema,
  legacyTransport: z.string().min(1).nullable(),
  capabilities: z.array(ProviderCapabilitySchema),
  lifecycle: ProviderLifecycleContractSchema,
  notes: z.string().min(1),
}).strict();

export const MODE_LIFECYCLE_CONTRACTS = Object.freeze({
  api: ProviderLifecycleContractSchema.parse({
    longRunning: false,
    hooks: LIFECYCLE_HOOK_NAMES,
    timeoutAction: 'graceful_stop',
    cleanupScope: 'none',
    supportsCheckpointing: false,
    supportsSuspend: false,
  }),
  cli: ProviderLifecycleContractSchema.parse({
    longRunning: true,
    hooks: LIFECYCLE_HOOK_NAMES,
    timeoutAction: 'kill',
    cleanupScope: 'process',
    supportsCheckpointing: false,
    supportsSuspend: false,
  }),
  agent: ProviderLifecycleContractSchema.parse({
    longRunning: true,
    hooks: LIFECYCLE_HOOK_NAMES,
    timeoutAction: 'suspend',
    cleanupScope: 'workspace',
    supportsCheckpointing: true,
    supportsSuspend: true,
  }),
});

export const LEGACY_PROVIDER_MODE_TARGETS = Object.freeze({
  claude: {
    mode: 'cli',
    adapter: 'CliAdapter',
    executionTransport: 'subprocess',
    notes: 'Current wrapper delegates to claude CLI via `claude -p`, so it behaves as a CLI adapter.',
  },
  gemini: {
    mode: 'cli',
    adapter: 'CliAdapter',
    executionTransport: 'subprocess',
    notes: 'Current wrapper shells out to gemini CLI and parses stdout/stderr.',
  },
  codex: {
    mode: 'cli',
    adapter: 'CliAdapter',
    executionTransport: 'subprocess',
    notes: 'Current wrapper uses `codex exec`, which is subprocess-oriented CLI execution.',
  },
  opencode: {
    mode: 'cli',
    adapter: 'CliAdapter',
    executionTransport: 'subprocess',
    notes: 'Current wrapper runs `opencode run` and normalizes CLI JSON/text output.',
  },
});

export function parseProviderModeContract(input) {
  return ProviderModeContractSchema.parse(input);
}

export function listLegacyProviderModeTargets() {
  return Object.entries(LEGACY_PROVIDER_MODE_TARGETS).map(([key, target]) =>
    parseProviderModeContract({
      key,
      mode: target.mode,
      adapter: target.adapter,
      executionTransport: target.executionTransport,
      legacyTransport: null,
      capabilities: [],
      lifecycle: MODE_LIFECYCLE_CONTRACTS[target.mode],
      notes: target.notes,
    })
  );
}

export function getProviderModeContract(providerName) {
  const target = LEGACY_PROVIDER_MODE_TARGETS[providerName];
  if (!target) return null;
  return parseProviderModeContract({
    key: providerName,
    mode: target.mode,
    adapter: target.adapter,
    executionTransport: target.executionTransport,
    legacyTransport: null,
    capabilities: [],
    lifecycle: MODE_LIFECYCLE_CONTRACTS[target.mode],
    notes: target.notes,
  });
}

export function createProviderAdapter(legacyProvider) {
  const name = String(legacyProvider?.name || '').trim();
  if (!name) throw new Error('Legacy provider is missing a name');

  const target = LEGACY_PROVIDER_MODE_TARGETS[name];
  if (!target) {
    throw new Error(`Unknown provider mode target: ${name}`);
  }

  const capabilities = Array.isArray(legacyProvider.capabilities)
    ? legacyProvider.capabilities.map(value => String(value))
    : [];
  const contract = parseProviderModeContract({
    key: name,
    mode: target.mode,
    adapter: target.adapter,
    executionTransport: target.executionTransport,
    legacyTransport: legacyProvider.transport ?? null,
    capabilities,
    lifecycle: MODE_LIFECYCLE_CONTRACTS[target.mode],
    notes: target.notes,
  });

  const adapter = {
    name,
    key: contract.key,
    mode: contract.mode,
    adapter: contract.adapter,
    transport: legacyProvider.transport ?? null,
    legacyTransport: contract.legacyTransport,
    executionTransport: contract.executionTransport,
    capabilities,
    strengths: Array.isArray(legacyProvider.strengths)
      ? legacyProvider.strengths.map(value => String(value))
      : [],
    bestFor: legacyProvider.bestFor || {},
    lifecycle: contract.lifecycle,
    contract,
    providerKey() {
      return contract.key;
    },
    normalizeOutput(result) {
      return normalizeProviderOutput(result);
    },
    estimateCost() {
      return null;
    },
    invoke: bindProviderMethod(legacyProvider.invoke, legacyProvider),
    healthCheck: bindProviderMethod(legacyProvider.healthCheck, legacyProvider),
    onTaskStart: async () => {},
    onTaskEnd: async () => {},
    onStepStart: async () => {},
    onStepEnd: async () => {},
    onStepTimeout: async () => contract.lifecycle.timeoutAction,
    onAbort: async () => {},
  };

  if (typeof legacyProvider.review === 'function') {
    adapter.review = bindProviderMethod(legacyProvider.review, legacyProvider);
  }

  defineProxyGetter(adapter, 'models', legacyProvider);
  defineProxyGetter(adapter, 'modelInfo', legacyProvider);

  return adapter;
}

function bindProviderMethod(method, legacyProvider) {
  if (typeof method !== 'function') {
    return async () => ({ status: 'error', error: 'provider_method_not_implemented' });
  }
  return (...args) => method.apply(legacyProvider, args);
}

function defineProxyGetter(target, propertyName, source) {
  Object.defineProperty(target, propertyName, {
    enumerable: true,
    get() {
      return source?.[propertyName];
    },
  });
}

function normalizeProviderOutput(result) {
  if (!result || typeof result !== 'object') {
    return {
      status: 'error',
      error: 'invalid_provider_result',
      detail: 'Provider result must be an object',
    };
  }

  if (result.status === 'success') {
    return {
      ...result,
      response: result.response ?? result.text ?? '',
    };
  }

  return {
    ...result,
    status: result.status || 'error',
    error: result.error || 'provider_error',
  };
}
