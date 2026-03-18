import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRuntimeFallbackInventory,
  RuntimeFallbackInventorySchema,
} from '../src/contracts/runtime-resilience-schemas.js';

test('buildRuntimeFallbackInventory marks json backup and local-model candidates as offline-ready', () => {
  const inventory = buildRuntimeFallbackInventory({
    now: '2026-03-12T10:30:00.000Z',
    shellSummary: {
      session: {
        stage: 'execute',
        lead: 'claude',
        task: 'Keep runtime available during storage failover',
        updatedAt: '2026-03-12T10:25:00.000Z',
      },
      project: {
        name: 'claude_ctx',
        branch: 'master',
        stackLabel: 'Node.js',
      },
      storage: {
        status: 'degraded',
        mode: 'sqlite',
        effectiveMode: 'json-backup',
        policyState: 'forced_json',
        failureRatio: 0.5,
        failover: true,
        shadow: false,
        warningActive: true,
        reasons: ['primary_storage_unavailable'],
        sourceCount: 2,
        sources: {},
        ts: '2026-03-12T10:24:00.000Z',
      },
      providers: {
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
            lastLatencyMs: 190,
            lastSuccess: '2026-03-12T10:20:00.000Z',
            lastFailure: '2026-03-12T10:21:00.000Z',
            updatedAt: '2026-03-12T10:22:00.000Z',
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
            lastLatencyMs: 280,
            lastSuccess: '2026-03-12T10:19:00.000Z',
            lastFailure: null,
            updatedAt: '2026-03-12T10:20:00.000Z',
            hasTelemetry: true,
            reasons: [],
          },
        ],
      },
    },
    providerExtensibility: {
      generatedAt: '2026-03-12T10:29:00.000Z',
      summary: {
        totalProviders: 2,
        builtinOnly: 1,
        configurable: 0,
        localModelCapable: 1,
      },
      providers: [
        {
          provider: 'claude',
          mode: 'cli',
          adapter: 'CliAdapter',
          transport: 'subprocess',
          executionTransport: 'subprocess',
          lifecycle: {
            longRunning: true,
            hooks: ['onTaskStart'],
            timeoutAction: 'kill',
            cleanupScope: 'process',
            supportsCheckpointing: false,
            supportsSuspend: false,
          },
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
          lifecycle: {
            longRunning: true,
            hooks: ['onTaskStart'],
            timeoutAction: 'kill',
            cleanupScope: 'process',
            supportsCheckpointing: false,
            supportsSuspend: false,
          },
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
      ],
    },
  });

  assert.equal(inventory.offlineReady, true);
  assert.equal(inventory.storage.fallbackMode, 'json_backup');
  assert.ok(inventory.storage.availableActions.includes('retry_primary_storage'));
  assert.equal(inventory.providers.lead, 'claude');
  assert.equal(inventory.providers.leadStatus, 'degraded');
  assert.equal(inventory.summary.fallbackCandidateCount, 1);
  assert.equal(inventory.summary.localModelFallbackCount, 1);
  assert.equal(inventory.providers.candidates[0].provider, 'opencode');
  assert.equal(inventory.providers.candidates[0].role, 'local_model_fallback');

  assert.doesNotThrow(() => RuntimeFallbackInventorySchema.parse(inventory));
});

test('buildRuntimeFallbackInventory marks runtime as not offline-ready when storage is unavailable', () => {
  const inventory = buildRuntimeFallbackInventory({
    shellSummary: {
      session: {
        stage: 'execute',
        lead: 'codex',
        task: null,
        updatedAt: null,
      },
      project: {
        name: 'claude_ctx',
        branch: 'master',
        stackLabel: 'Node.js',
      },
      storage: {
        status: 'offline',
        mode: 'unknown',
        effectiveMode: 'unknown',
        policyState: null,
        failureRatio: null,
        failover: false,
        shadow: false,
        warningActive: false,
        reasons: ['storage_surface_unavailable'],
        sourceCount: 0,
        sources: {},
        ts: null,
      },
      providers: {
        models: {},
        cards: [],
      },
    },
    providerExtensibility: {
      generatedAt: '2026-03-12T10:31:00.000Z',
      summary: {
        totalProviders: 1,
        builtinOnly: 0,
        configurable: 1,
        localModelCapable: 0,
      },
      providers: [
        {
          provider: 'codex',
          mode: 'cli',
          adapter: 'CliAdapter',
          transport: 'bash',
          executionTransport: 'subprocess',
          lifecycle: {
            longRunning: true,
            hooks: ['onTaskStart'],
            timeoutAction: 'kill',
            cleanupScope: 'process',
            supportsCheckpointing: false,
            supportsSuspend: false,
          },
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
      ],
    },
  });

  assert.equal(inventory.offlineReady, false);
  assert.equal(inventory.storage.fallbackMode, 'unavailable');
  assert.ok(inventory.storage.availableActions.includes('manual_recovery'));
  assert.equal(inventory.summary.providerOfflineCount, 1);
  assert.equal(inventory.providers.candidates[0].role, 'recovery_only');
});
