import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildResilienceAuditInventory,
  ResilienceAuditInventorySchema,
} from '../src/contracts/runtime-resilience-schemas.js';

function createProviderRecoveryInventory(providers) {
  return {
    generatedAt: '2026-03-12T12:10:00.000Z',
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
  };
}

function createRuntimeFallbackInventory(storageOverrides = {}, candidates = []) {
  return {
    generatedAt: '2026-03-12T12:10:00.000Z',
    offlineReady: true,
    summary: {
      storageOffline: storageOverrides.status === 'offline',
      fallbackCandidateCount: candidates.filter((candidate) => candidate.status !== 'offline').length,
      localModelFallbackCount: candidates.filter((candidate) => candidate.status !== 'offline' && candidate.supportsLocalModels).length,
      providerOfflineCount: candidates.filter((candidate) => candidate.status === 'offline').length,
    },
    storage: {
      status: 'degraded',
      effectiveMode: 'json-backup',
      policyState: 'forced_json',
      failureRatio: 0.5,
      reasons: ['primary_storage_unavailable'],
      fallbackMode: 'json_backup',
      availableActions: ['continue_with_fallback_storage', 'retry_primary_storage'],
      ...storageOverrides,
    },
    providers: {
      lead: 'claude',
      leadStatus: 'degraded',
      readyCount: candidates.filter((candidate) => candidate.status === 'ready').length,
      degradedCount: candidates.filter((candidate) => candidate.status === 'degraded').length,
      offlineCount: candidates.filter((candidate) => candidate.status === 'offline').length,
      localModelCapableCount: candidates.filter((candidate) => candidate.status !== 'offline' && candidate.supportsLocalModels).length,
      candidates,
    },
  };
}

test('buildResilienceAuditInventory emits outage events, notifications, and throttles for repeated failures', () => {
  const inventory = buildResilienceAuditInventory({
    now: '2026-03-12T12:11:00.000Z',
    shellSummary: {
      session: {
        stage: 'execute',
        lead: 'claude',
        task: 'Handle outage transitions',
        updatedAt: '2026-03-12T12:09:00.000Z',
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
        failureRatio: 0.44,
        failover: true,
        shadow: false,
        warningActive: true,
        reasons: ['primary_storage_unavailable'],
        sourceCount: 2,
        sources: {},
        ts: '2026-03-12T12:08:00.000Z',
      },
      providers: {
        models: {
          claude: 'claude-opus-4-6',
          opencode: 'opencode/glm-4.7',
        },
        cards: [
          {
            provider: 'claude',
            status: 'offline',
            model: 'claude-opus-4-6',
            calls: 14,
            successes: 10,
            failures: 4,
            consecutiveFailures: 4,
            circuitOpen: true,
            successRate: 71.4,
            avgLatencyMs: 300,
            lastLatencyMs: 450,
            lastSuccess: '2026-03-12T11:56:00.000Z',
            lastFailure: '2026-03-12T12:07:00.000Z',
            updatedAt: '2026-03-12T12:07:00.000Z',
            hasTelemetry: true,
            reasons: ['provider_circuit_open'],
          },
          {
            provider: 'opencode',
            status: 'ready',
            model: 'opencode/glm-4.7',
            calls: 6,
            successes: 6,
            failures: 0,
            consecutiveFailures: 0,
            circuitOpen: false,
            successRate: 100,
            avgLatencyMs: 220,
            lastLatencyMs: 200,
            lastSuccess: '2026-03-12T12:06:00.000Z',
            lastFailure: null,
            updatedAt: '2026-03-12T12:06:00.000Z',
            hasTelemetry: true,
            reasons: [],
          },
        ],
      },
    },
    providerRecovery: createProviderRecoveryInventory([
      {
        provider: 'claude',
        status: 'offline',
        outageLevel: 'offline',
        adapter: 'CliAdapter',
        executionTransport: 'subprocess',
        currentModel: 'claude-opus-4-6',
        defaultModel: 'claude-opus-4-6',
        fallbackProvider: 'opencode',
        fallbackRole: 'local_model_fallback',
        recommendedAction: 'switch_to_local_model_provider',
        availableActions: ['switch_to_local_model_provider', 'wait_for_circuit_reset', 'restart_subprocess_session'],
        reasons: ['provider_circuit_open'],
        hooks: {
          lifecycleHooks: ['onTaskStart', 'onTaskEnd', 'onAbort'],
          timeoutAction: 'kill',
          cleanupScope: 'process',
          supportsCheckpointing: false,
          supportsSuspend: false,
        },
      },
      {
        provider: 'opencode',
        status: 'ready',
        outageLevel: 'none',
        adapter: 'CliAdapter',
        executionTransport: 'subprocess',
        currentModel: 'opencode/glm-4.7',
        defaultModel: 'opencode/glm-4.7',
        fallbackProvider: null,
        fallbackRole: null,
        recommendedAction: 'continue_with_provider',
        availableActions: ['continue_with_provider'],
        reasons: [],
        hooks: {
          lifecycleHooks: ['onTaskStart', 'onTaskEnd', 'onAbort'],
          timeoutAction: 'kill',
          cleanupScope: 'process',
          supportsCheckpointing: false,
          supportsSuspend: false,
        },
      },
    ]),
    runtimeFallbacks: createRuntimeFallbackInventory({}, [
      {
        provider: 'opencode',
        status: 'ready',
        role: 'local_model_fallback',
        priority: 1,
        currentModel: 'opencode/glm-4.7',
        defaultModel: 'opencode/glm-4.7',
        supportsCustomModels: true,
        supportsLocalModels: true,
        reasons: ['runtime_ready', 'local_model_capable'],
      },
      {
        provider: 'claude',
        status: 'offline',
        role: 'recovery_only',
        priority: 2,
        currentModel: 'claude-opus-4-6',
        defaultModel: 'claude-opus-4-6',
        supportsCustomModels: false,
        supportsLocalModels: false,
        reasons: ['runtime_offline'],
      },
    ]),
  });

  assert.equal(inventory.summary.totalEvents, 2);
  assert.equal(inventory.summary.openIncidents, 2);
  assert.equal(inventory.summary.recoveryEvents, 0);
  assert.equal(inventory.summary.throttles, 2);
  assert.equal(inventory.summary.notifications, 4);
  assert.equal(inventory.summary.offlineProviders, 1);
  assert.equal(inventory.summary.storageStatus, 'degraded');
  assert.equal(inventory.events[0].target, 'storage');
  assert.equal(inventory.events[1].target, 'claude');
  assert.ok(inventory.notifications.some((notification) => notification.kind === 'operator_banner'));
  assert.ok(inventory.throttles.some((throttle) => throttle.target === 'claude' && throttle.mode === 'shift_to_fallback'));
  assert.ok(inventory.throttles.some((throttle) => throttle.target === 'storage' && throttle.mode === 'pause_mutations'));

  assert.doesNotThrow(() => ResilienceAuditInventorySchema.parse(inventory));
});

test('buildResilienceAuditInventory emits recovery notices when storage and provider have recovered', () => {
  const inventory = buildResilienceAuditInventory({
    now: '2026-03-12T12:12:00.000Z',
    shellSummary: {
      session: {
        stage: 'execute',
        lead: 'opencode',
        task: null,
        updatedAt: '2026-03-12T12:10:00.000Z',
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
        failureRatio: 0.08,
        failover: true,
        shadow: false,
        warningActive: false,
        reasons: [],
        sourceCount: 2,
        sources: {},
        ts: '2026-03-12T12:09:00.000Z',
      },
      providers: {
        models: {
          opencode: 'opencode/glm-4.7',
        },
        cards: [
          {
            provider: 'opencode',
            status: 'ready',
            model: 'opencode/glm-4.7',
            calls: 9,
            successes: 9,
            failures: 0,
            consecutiveFailures: 0,
            circuitOpen: false,
            successRate: 100,
            avgLatencyMs: 180,
            lastLatencyMs: 170,
            lastSuccess: '2026-03-12T12:08:30.000Z',
            lastFailure: '2026-03-12T12:07:00.000Z',
            updatedAt: '2026-03-12T12:08:30.000Z',
            hasTelemetry: true,
            reasons: [],
          },
        ],
      },
    },
    providerRecovery: createProviderRecoveryInventory([
      {
        provider: 'opencode',
        status: 'ready',
        outageLevel: 'none',
        adapter: 'CliAdapter',
        executionTransport: 'subprocess',
        currentModel: 'opencode/glm-4.7',
        defaultModel: 'opencode/glm-4.7',
        fallbackProvider: null,
        fallbackRole: null,
        recommendedAction: 'continue_with_provider',
        availableActions: ['continue_with_provider'],
        reasons: [],
        hooks: {
          lifecycleHooks: ['onTaskStart', 'onTaskEnd', 'onAbort'],
          timeoutAction: 'kill',
          cleanupScope: 'process',
          supportsCheckpointing: false,
          supportsSuspend: false,
        },
      },
    ]),
    runtimeFallbacks: createRuntimeFallbackInventory({
      status: 'ready',
      effectiveMode: 'sqlite',
      policyState: 'primary',
      failureRatio: 0.08,
      reasons: [],
      fallbackMode: 'none',
      availableActions: ['continue_with_primary_storage'],
    }, [
      {
        provider: 'opencode',
        status: 'ready',
        role: 'active_lead',
        priority: 1,
        currentModel: 'opencode/glm-4.7',
        defaultModel: 'opencode/glm-4.7',
        supportsCustomModels: true,
        supportsLocalModels: true,
        reasons: ['current_lead', 'runtime_ready'],
      },
    ]),
  });

  assert.equal(inventory.summary.totalEvents, 2);
  assert.equal(inventory.summary.openIncidents, 0);
  assert.equal(inventory.summary.recoveryEvents, 2);
  assert.equal(inventory.summary.throttles, 0);
  assert.ok(inventory.events.every((event) => event.transition === 'recovered'));
  assert.ok(inventory.notifications.every((notification) => notification.kind === 'recovery_notice'));
  assert.equal(inventory.notifications[0].suggestedAction !== null, true);

  assert.doesNotThrow(() => ResilienceAuditInventorySchema.parse(inventory));
});
