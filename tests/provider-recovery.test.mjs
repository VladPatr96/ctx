import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProviderRecoveryInventory,
  ProviderRecoveryInventorySchema,
} from '../src/contracts/runtime-resilience-schemas.js';
import { MODE_LIFECYCLE_CONTRACTS } from '../src/providers/provider-modes.js';

function createShellSummary({ models = {}, cards = [] } = {}) {
  return {
    session: {
      stage: 'execute',
      lead: 'claude',
      task: 'Recover provider outages predictably',
      updatedAt: '2026-03-12T12:00:00.000Z',
    },
    project: {
      name: 'claude_ctx',
      branch: 'master',
      stackLabel: 'Node.js',
    },
    storage: {
      status: 'ready',
      mode: 'sqlite',
      effectiveMode: 'sqlite',
      policyState: 'primary',
      failureRatio: 0,
      failover: false,
      shadow: false,
      warningActive: false,
      reasons: [],
      sourceCount: 1,
      sources: {},
      ts: '2026-03-12T11:58:00.000Z',
    },
    providers: {
      models,
      cards,
    },
  };
}

function createRuntimeFallbacks({ lead = 'claude', leadStatus = 'ready', candidates = [] } = {}) {
  return {
    generatedAt: '2026-03-12T12:01:00.000Z',
    offlineReady: true,
    summary: {
      storageOffline: false,
      fallbackCandidateCount: candidates.filter((candidate) => candidate.provider !== lead && candidate.status !== 'offline').length,
      localModelFallbackCount: candidates.filter((candidate) => candidate.provider !== lead && candidate.status !== 'offline' && candidate.supportsLocalModels).length,
      providerOfflineCount: candidates.filter((candidate) => candidate.status === 'offline').length,
    },
    storage: {
      status: 'ready',
      effectiveMode: 'sqlite',
      policyState: 'primary',
      failureRatio: 0,
      reasons: [],
      fallbackMode: 'none',
      availableActions: ['continue_with_primary_storage'],
    },
    providers: {
      lead,
      leadStatus,
      readyCount: candidates.filter((candidate) => candidate.status === 'ready').length,
      degradedCount: candidates.filter((candidate) => candidate.status === 'degraded').length,
      offlineCount: candidates.filter((candidate) => candidate.status === 'offline').length,
      localModelCapableCount: candidates.filter((candidate) => candidate.status !== 'offline' && candidate.supportsLocalModels).length,
      candidates,
    },
  };
}

function createExtensibilityInventory(providers) {
  return {
    generatedAt: '2026-03-12T12:01:00.000Z',
    summary: {
      totalProviders: providers.length,
      builtinOnly: providers.filter((provider) => provider.extensibility === 'builtin_only').length,
      configurable: providers.filter((provider) => provider.extensibility === 'configurable').length,
      localModelCapable: providers.filter((provider) => provider.extensibility === 'local_model_capable').length,
    },
    providers,
  };
}

test('buildProviderRecoveryInventory exposes deterministic actions for degraded lead providers', () => {
  const inventory = buildProviderRecoveryInventory({
    now: '2026-03-12T12:02:00.000Z',
    shellSummary: createShellSummary({
      models: {
        claude: 'claude-opus-4-6',
        opencode: 'opencode/glm-4.7',
      },
      cards: [
        {
          provider: 'claude',
          status: 'degraded',
          model: 'claude-opus-4-6',
          calls: 10,
          successes: 8,
          failures: 2,
          consecutiveFailures: 2,
          circuitOpen: false,
          successRate: 80,
          avgLatencyMs: 200,
          lastLatencyMs: 180,
          lastSuccess: '2026-03-12T11:55:00.000Z',
          lastFailure: '2026-03-12T11:57:00.000Z',
          updatedAt: '2026-03-12T11:57:00.000Z',
          hasTelemetry: true,
          reasons: ['recent_provider_failures'],
        },
        {
          provider: 'opencode',
          status: 'ready',
          model: 'opencode/glm-4.7',
          calls: 4,
          successes: 4,
          failures: 0,
          consecutiveFailures: 0,
          circuitOpen: false,
          successRate: 100,
          avgLatencyMs: 320,
          lastLatencyMs: 260,
          lastSuccess: '2026-03-12T11:56:00.000Z',
          lastFailure: null,
          updatedAt: '2026-03-12T11:56:00.000Z',
          hasTelemetry: true,
          reasons: [],
        },
      ],
    }),
    providerExtensibility: createExtensibilityInventory([
      {
        provider: 'claude',
        mode: 'cli',
        adapter: 'CliAdapter',
        transport: 'subprocess',
        executionTransport: 'subprocess',
        lifecycle: MODE_LIFECYCLE_CONTRACTS.cli,
        capabilities: ['planning'],
        notes: 'Builtin claude wrapper',
        pluginSurface: 'builtin_provider',
        extensibility: 'builtin_only',
        modelSource: 'static_catalog',
        supportsCustomModels: false,
        supportsLocalModels: false,
        defaultModel: 'claude-opus-4-6',
        modelCount: 1,
        exampleModels: ['claude-opus-4-6'],
        discoveryInputs: [{ kind: 'static_catalog', value: 'bundled claude wrapper model catalog', optional: false }],
        localModelHints: [],
      },
      {
        provider: 'opencode',
        mode: 'cli',
        adapter: 'CliAdapter',
        transport: 'mcp',
        executionTransport: 'subprocess',
        lifecycle: MODE_LIFECYCLE_CONTRACTS.cli,
        capabilities: ['skills'],
        notes: 'Hybrid opencode wrapper',
        pluginSurface: 'local_model_provider',
        extensibility: 'local_model_capable',
        modelSource: 'hybrid',
        supportsCustomModels: true,
        supportsLocalModels: true,
        defaultModel: 'opencode/glm-4.7',
        modelCount: 2,
        exampleModels: ['opencode/glm-4.7', 'ollama/llama3'],
        discoveryInputs: [
          { kind: 'config_file', value: './opencode.json', optional: true },
          { kind: 'command', value: 'opencode models', optional: true },
        ],
        localModelHints: ['Local and self-hosted providers are surfaced through OpenCode config and CLI discovery.'],
      },
    ]),
    runtimeFallbacks: createRuntimeFallbacks({
      lead: 'claude',
      leadStatus: 'degraded',
      candidates: [
        {
          provider: 'opencode',
          status: 'ready',
          role: 'local_model_fallback',
          priority: 1,
          currentModel: 'opencode/glm-4.7',
          defaultModel: 'opencode/glm-4.7',
          supportsCustomModels: true,
          supportsLocalModels: true,
          reasons: ['runtime_ready', 'local_model_capable', 'custom_model_capable'],
        },
        {
          provider: 'claude',
          status: 'degraded',
          role: 'active_lead',
          priority: 2,
          currentModel: 'claude-opus-4-6',
          defaultModel: 'claude-opus-4-6',
          supportsCustomModels: false,
          supportsLocalModels: false,
          reasons: ['current_lead', 'runtime_degraded'],
        },
      ],
    }),
  });

  const claude = inventory.providers.find((provider) => provider.provider === 'claude');
  const opencode = inventory.providers.find((provider) => provider.provider === 'opencode');

  assert.equal(inventory.summary.actionableProviders, 1);
  assert.equal(inventory.summary.degradedProviders, 1);
  assert.equal(inventory.summary.offlineProviders, 0);
  assert.equal(inventory.summary.localModelRecoveryOptions, 1);
  assert.equal(claude.outageLevel, 'degraded');
  assert.equal(claude.recommendedAction, 'switch_to_local_model_provider');
  assert.ok(claude.availableActions.includes('restart_subprocess_session'));
  assert.ok(claude.availableActions.includes('retry_request'));
  assert.equal(claude.fallbackProvider, 'opencode');
  assert.equal(claude.hooks.timeoutAction, 'kill');
  assert.equal(opencode.outageLevel, 'none');
  assert.equal(opencode.recommendedAction, 'continue_with_provider');

  assert.doesNotThrow(() => ProviderRecoveryInventorySchema.parse(inventory));
});

test('buildProviderRecoveryInventory treats providers without runtime cards as offline and actionable', () => {
  const inventory = buildProviderRecoveryInventory({
    now: '2026-03-12T12:03:00.000Z',
    shellSummary: createShellSummary({
      models: {
        opencode: 'opencode/glm-4.7',
      },
      cards: [
        {
          provider: 'opencode',
          status: 'ready',
          model: 'opencode/glm-4.7',
          calls: 4,
          successes: 4,
          failures: 0,
          consecutiveFailures: 0,
          circuitOpen: false,
          successRate: 100,
          avgLatencyMs: 320,
          lastLatencyMs: 260,
          lastSuccess: '2026-03-12T11:58:00.000Z',
          lastFailure: null,
          updatedAt: '2026-03-12T11:58:00.000Z',
          hasTelemetry: true,
          reasons: [],
        },
      ],
    }),
    providerExtensibility: createExtensibilityInventory([
      {
        provider: 'codex',
        mode: 'cli',
        adapter: 'CliAdapter',
        transport: 'bash',
        executionTransport: 'subprocess',
        lifecycle: MODE_LIFECYCLE_CONTRACTS.cli,
        capabilities: ['exec'],
        notes: 'Config-driven codex wrapper',
        pluginSurface: 'configurable_provider',
        extensibility: 'configurable',
        modelSource: 'config_file',
        supportsCustomModels: true,
        supportsLocalModels: false,
        defaultModel: 'gpt-5.3-codex',
        modelCount: 1,
        exampleModels: ['gpt-5.3-codex'],
        discoveryInputs: [{ kind: 'config_file', value: '~/.codex/config.toml', optional: true }],
        localModelHints: ['Custom model ids are admitted through the Codex config and CLI flags.'],
      },
      {
        provider: 'opencode',
        mode: 'cli',
        adapter: 'CliAdapter',
        transport: 'mcp',
        executionTransport: 'subprocess',
        lifecycle: MODE_LIFECYCLE_CONTRACTS.cli,
        capabilities: ['skills'],
        notes: 'Hybrid opencode wrapper',
        pluginSurface: 'local_model_provider',
        extensibility: 'local_model_capable',
        modelSource: 'hybrid',
        supportsCustomModels: true,
        supportsLocalModels: true,
        defaultModel: 'opencode/glm-4.7',
        modelCount: 2,
        exampleModels: ['opencode/glm-4.7', 'ollama/llama3'],
        discoveryInputs: [
          { kind: 'config_file', value: './opencode.json', optional: true },
          { kind: 'command', value: 'opencode models', optional: true },
        ],
        localModelHints: ['Local and self-hosted providers are surfaced through OpenCode config and CLI discovery.'],
      },
    ]),
    runtimeFallbacks: createRuntimeFallbacks({
      lead: 'codex',
      leadStatus: 'offline',
      candidates: [
        {
          provider: 'opencode',
          status: 'ready',
          role: 'local_model_fallback',
          priority: 1,
          currentModel: 'opencode/glm-4.7',
          defaultModel: 'opencode/glm-4.7',
          supportsCustomModels: true,
          supportsLocalModels: true,
          reasons: ['runtime_ready', 'local_model_capable', 'custom_model_capable'],
        },
        {
          provider: 'codex',
          status: 'offline',
          role: 'recovery_only',
          priority: 2,
          currentModel: null,
          defaultModel: 'gpt-5.3-codex',
          supportsCustomModels: true,
          supportsLocalModels: false,
          reasons: ['runtime_offline', 'provider_unconfigured'],
        },
      ],
    }),
  });

  const codex = inventory.providers.find((provider) => provider.provider === 'codex');

  assert.equal(inventory.summary.actionableProviders, 1);
  assert.equal(inventory.summary.offlineProviders, 1);
  assert.equal(inventory.summary.localModelRecoveryOptions, 1);
  assert.equal(codex.status, 'offline');
  assert.equal(codex.outageLevel, 'offline');
  assert.equal(codex.recommendedAction, 'switch_to_local_model_provider');
  assert.ok(codex.availableActions.includes('manual_reconfigure_provider'));
  assert.ok(codex.availableActions.includes('restart_subprocess_session'));
  assert.deepEqual(codex.reasons, ['provider_unconfigured']);
  assert.equal(codex.fallbackProvider, 'opencode');

  assert.doesNotThrow(() => ProviderRecoveryInventorySchema.parse(inventory));
});
