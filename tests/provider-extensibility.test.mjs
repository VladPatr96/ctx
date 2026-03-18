import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProviderExtensibilityInventory,
  ProviderExtensibilityInventorySchema,
} from '../src/contracts/provider-schemas.js';
import { MODE_LIFECYCLE_CONTRACTS } from '../src/providers/provider-modes.js';
import { listProviderExtensibilityInventory } from '../src/providers/index.js';

test('buildProviderExtensibilityInventory classifies builtin, configurable, and local-model providers', () => {
  const inventory = buildProviderExtensibilityInventory({
    generatedAt: '2026-03-12T10:00:00.000Z',
    providers: [
      {
        provider: 'claude',
        mode: 'cli',
        adapter: 'CliAdapter',
        transport: 'subprocess',
        executionTransport: 'subprocess',
        lifecycle: MODE_LIFECYCLE_CONTRACTS.cli,
        capabilities: ['planning', 'review'],
        notes: 'Builtin claude wrapper',
        modelInfo: {
          defaultModel: 'claude-opus-4-6',
          models: [{ id: 'claude-opus-4-6' }],
        },
      },
      {
        provider: 'codex',
        mode: 'cli',
        adapter: 'CliAdapter',
        transport: 'bash',
        executionTransport: 'subprocess',
        lifecycle: MODE_LIFECYCLE_CONTRACTS.cli,
        capabilities: ['exec'],
        notes: 'Config-driven codex wrapper',
        modelInfo: {
          defaultModel: 'gpt-5.3-codex',
          models: [{ id: 'gpt-5.3-codex' }],
        },
      },
      {
        provider: 'opencode',
        mode: 'cli',
        adapter: 'CliAdapter',
        transport: 'mcp',
        executionTransport: 'subprocess',
        lifecycle: MODE_LIFECYCLE_CONTRACTS.cli,
        capabilities: ['skills', 'agents'],
        notes: 'Hybrid opencode wrapper',
        modelInfo: {
          defaultModel: 'opencode/glm-4.7',
          models: [{ id: 'opencode/glm-4.7' }, { id: 'ollama/llama3' }],
        },
      },
    ],
  });

  assert.equal(inventory.summary.totalProviders, 3);
  assert.equal(inventory.summary.builtinOnly, 1);
  assert.equal(inventory.summary.configurable, 1);
  assert.equal(inventory.summary.localModelCapable, 1);

  const opencode = inventory.providers.find((provider) => provider.provider === 'opencode');
  assert.ok(opencode);
  assert.equal(opencode.pluginSurface, 'local_model_provider');
  assert.equal(opencode.supportsLocalModels, true);
  assert.equal(opencode.modelSource, 'hybrid');
  assert.deepEqual(opencode.exampleModels, ['opencode/glm-4.7', 'ollama/llama3']);

  assert.doesNotThrow(() => ProviderExtensibilityInventorySchema.parse(inventory));
});

test('provider registry exposes extensibility inventory with first-class local-model metadata', () => {
  const inventory = listProviderExtensibilityInventory();
  const byProvider = new Map(inventory.providers.map((provider) => [provider.provider, provider]));

  assert.equal(inventory.summary.totalProviders, 4);
  assert.ok(byProvider.has('claude'));
  assert.ok(byProvider.has('gemini'));
  assert.ok(byProvider.has('codex'));
  assert.ok(byProvider.has('opencode'));

  assert.equal(byProvider.get('claude').extensibility, 'builtin_only');
  assert.equal(byProvider.get('codex').extensibility, 'configurable');
  assert.equal(byProvider.get('codex').supportsCustomModels, true);
  assert.equal(byProvider.get('opencode').extensibility, 'local_model_capable');
  assert.equal(byProvider.get('opencode').supportsLocalModels, true);
  assert.equal(byProvider.get('opencode').pluginSurface, 'local_model_provider');
  assert.ok(byProvider.get('opencode').discoveryInputs.some((input) => input.value === 'opencode models'));
});
