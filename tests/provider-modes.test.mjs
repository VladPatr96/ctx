import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AbortActionSchema,
  MODE_LIFECYCLE_CONTRACTS,
  ProviderModeContractSchema,
  createProviderAdapter,
} from '../src/providers/provider-modes.js';
import { getProvider, listProviderModeTargets, listProviders } from '../src/providers/index.js';
import claude from '../src/providers/claude.js';
import gemini from '../src/providers/gemini.js';
import codex from '../src/providers/codex.js';
import opencode from '../src/providers/opencode.js';

test('legacy providers map to canonical CLI mode contracts', () => {
  const targets = listProviderModeTargets();
  const byKey = new Map(targets.map(contract => [contract.key, contract]));

  assert.equal(byKey.size, 4);

  for (const providerKey of ['claude', 'gemini', 'codex', 'opencode']) {
    const contract = byKey.get(providerKey);
    assert.equal(contract.mode, 'cli');
    assert.equal(contract.adapter, 'CliAdapter');
    assert.equal(contract.executionTransport, 'subprocess');
    assert.doesNotThrow(() => ProviderModeContractSchema.parse(contract));
  }
});

test('createProviderAdapter preserves legacy behavior and exposes lifecycle hooks', async () => {
  const adapter = createProviderAdapter(codex);

  assert.equal(adapter.name, 'codex');
  assert.equal(adapter.mode, 'cli');
  assert.equal(adapter.adapter, 'CliAdapter');
  assert.equal(adapter.transport, 'bash');
  assert.equal(adapter.executionTransport, 'subprocess');
  assert.equal(adapter.providerKey(), 'codex');
  assert.equal(adapter.lifecycle.timeoutAction, 'kill');
  assert.equal(await adapter.onStepTimeout({ stepId: 'review' }), 'kill');
  assert.equal(await adapter.onTaskStart({ taskId: 'task-1' }), undefined);
  assert.equal(adapter.normalizeOutput({ status: 'success', text: 'ok' }).response, 'ok');
  assert.equal(adapter.normalizeOutput(null).status, 'error');
  assert.equal(adapter.estimateCost({}), null);
  assert.deepEqual(adapter.capabilities, codex.capabilities);
  assert.deepEqual(adapter.models, codex.models);
});

test('canonical lifecycle contracts distinguish api, cli, and agent runtime semantics', () => {
  assert.equal(MODE_LIFECYCLE_CONTRACTS.api.longRunning, false);
  assert.equal(MODE_LIFECYCLE_CONTRACTS.api.timeoutAction, 'graceful_stop');
  assert.equal(MODE_LIFECYCLE_CONTRACTS.cli.cleanupScope, 'process');
  assert.equal(MODE_LIFECYCLE_CONTRACTS.cli.supportsSuspend, false);
  assert.equal(MODE_LIFECYCLE_CONTRACTS.agent.supportsCheckpointing, true);
  assert.equal(MODE_LIFECYCLE_CONTRACTS.agent.timeoutAction, 'suspend');
  assert.doesNotThrow(() => AbortActionSchema.parse(MODE_LIFECYCLE_CONTRACTS.agent.timeoutAction));
});

test('provider registry surfaces mode and lifecycle metadata for runtime consumers', async () => {
  const providers = listProviders();
  const byName = new Map(providers.map(provider => [provider.name, provider]));
  const geminiEntry = byName.get('gemini');
  const claudeEntry = byName.get('claude');

  assert.equal(geminiEntry.mode, 'cli');
  assert.equal(geminiEntry.adapter, 'CliAdapter');
  assert.equal(geminiEntry.executionTransport, 'subprocess');
  assert.equal(geminiEntry.transport, 'mcp');
  assert.equal(geminiEntry.lifecycle.timeoutAction, 'kill');
  assert.equal(claudeEntry.lifecycle.cleanupScope, 'process');

  const provider = getProvider('claude');
  assert.equal(provider.mode, 'cli');
  assert.equal(provider.adapter, 'CliAdapter');
  assert.equal(await provider.onStepTimeout({ stepId: 'plan' }), 'kill');
  assert.equal(typeof provider.healthCheck, 'function');
  assert.equal(typeof provider.invoke, 'function');
});

test('all current wrappers normalize into registry-compatible adapters', () => {
  const adapters = [claude, gemini, codex, opencode].map(provider => createProviderAdapter(provider));

  for (const adapter of adapters) {
    assert.equal(adapter.mode, 'cli');
    assert.equal(adapter.adapter, 'CliAdapter');
    assert.ok(Array.isArray(adapter.capabilities));
    assert.ok(Array.isArray(adapter.strengths));
    assert.ok(adapter.contract.notes.length > 0);
  }
});
