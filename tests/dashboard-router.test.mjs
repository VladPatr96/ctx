import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { once, EventEmitter } from 'node:events';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { broadcast, createRouter, resetDashboardRuntimeCachesForTests, sseConnect, state } from '../scripts/dashboard-backend.js';
import { createEvalStore } from '../scripts/evaluation/eval-store.js';
import { buildConsiliumObservabilitySnapshot } from '../scripts/contracts/consilium-observability.js';

const TOKEN = 'test-dashboard-token';

async function withServer(run, options = {}) {
  const router = createRouter(() => '<html><body>ok</body></html>', TOKEN, options);
  const server = http.createServer((req, res) => {
    Promise.resolve(router(req, res)).catch((error) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: error?.message || 'router_error' }));
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;
  try {
    await run(base);
  } finally {
    server.close();
    await once(server, 'close');
  }
}

test('GET /api/state rejects unauthorized and allows authorized', async () => {
  await withServer(async (base) => {
    const unauthorized = await fetch(`${base}/api/state`);
    assert.equal(unauthorized.status, 401);

    const authorized = await fetch(`${base}/api/state?token=${TOKEN}`);
    assert.equal(authorized.status, 200);
    const payload = await authorized.json();
    assert.equal(typeof payload.pipeline, 'object');
  });
});

test('GET /api/shell/summary returns normalized shell contract', async () => {
  const previousState = JSON.parse(JSON.stringify(state));

  Object.assign(state.pipeline, {
    stage: 'execute',
    lead: 'codex',
    task: 'Stabilize shell contract',
    updatedAt: '2026-03-11T10:00:00.000Z',
    models: { claude: 'opus-4.6' }
  });
  state.project = {
    name: 'claude_ctx',
    git: { branch: 'master' },
    stack: 'Node.js'
  };
  state.storageHealth = {
    mode: 'sqlite',
    effectiveMode: 'json-backup',
    policyState: 'forced_json',
    failureRatio: 0.4,
    failover: true,
    shadow: true,
    warningActive: true,
    sources: {
      pipeline: { source: 'storage-adapter', backing: 'sqlite' }
    },
    ts: '2026-03-11T10:01:00.000Z'
  };
  state.providerHealth = {
    claude: {
      calls: 12,
      successes: 11,
      failures: 1,
      totalFailures: 1,
      avgLatencyMs: 150,
      lastSuccess: '2026-03-11T09:59:00.000Z',
      lastFailure: '2026-03-11T09:30:00.000Z'
    }
  };

  try {
    await withServer(async (base) => {
      const response = await fetch(`${base}/api/shell/summary?token=${TOKEN}`);
      assert.equal(response.status, 200);
      const payload = await response.json();

      assert.equal(payload.summary.session.task, 'Stabilize shell contract');
      assert.equal(payload.summary.project.branch, 'master');
      assert.equal(payload.summary.storage.mode, 'sqlite');
      assert.equal(payload.summary.storage.status, 'degraded');
      assert.equal(payload.summary.storage.effectiveMode, 'json-backup');
      assert.equal(payload.summary.storage.policyState, 'forced_json');
      assert.equal(payload.summary.providers.models.claude, 'opus-4.6');
      assert.equal(payload.summary.providers.cards[0].provider, 'claude');
      assert.equal(payload.summary.providers.cards[0].status, 'degraded');
      assert.equal(payload.summary.providers.cards[0].consecutiveFailures, 1);
      assert.equal(payload.summary.providers.cards[0].successRate, 91.66666666666666);
    });
  } finally {
    for (const key of Object.keys(state)) {
      delete state[key];
    }
    Object.assign(state, previousState);
  }
});

test('GET /api/providers/extensibility returns typed provider inventory', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/providers/extensibility?token=${TOKEN}`);
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.equal(payload.inventory.summary.totalProviders, 2);
    assert.equal(payload.inventory.summary.localModelCapable, 1);
    assert.equal(payload.inventory.providers[0].provider, 'claude');
    assert.equal(payload.inventory.providers[1].provider, 'opencode');
    assert.equal(payload.inventory.providers[1].supportsLocalModels, true);
  }, {
    providerExtensibilityLoader: async () => ({
      generatedAt: '2026-03-12T10:15:00.000Z',
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
          capabilities: ['skills', 'agents'],
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
    }),
  });
});

test('GET /api/providers/recovery returns typed provider outage recovery inventory', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/providers/recovery?token=${TOKEN}`);
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.equal(payload.inventory.summary.actionableProviders, 1);
    assert.equal(payload.inventory.summary.localModelRecoveryOptions, 1);
    assert.equal(payload.inventory.providers[0].provider, 'claude');
    assert.equal(payload.inventory.providers[0].recommendedAction, 'switch_to_local_model_provider');
    assert.equal(payload.inventory.providers[0].hooks.timeoutAction, 'kill');
  }, {
    providerRecoveryLoader: async () => ({
      generatedAt: '2026-03-12T10:35:00.000Z',
      summary: {
        totalProviders: 2,
        actionableProviders: 1,
        degradedProviders: 1,
        offlineProviders: 0,
        localModelRecoveryOptions: 1,
      },
      providers: [
        {
          provider: 'claude',
          status: 'degraded',
          outageLevel: 'degraded',
          adapter: 'CliAdapter',
          executionTransport: 'subprocess',
          currentModel: 'claude-opus-4-6',
          defaultModel: 'claude-opus-4-6',
          fallbackProvider: 'opencode',
          fallbackRole: 'local_model_fallback',
          recommendedAction: 'switch_to_local_model_provider',
          availableActions: ['switch_to_local_model_provider', 'restart_subprocess_session', 'retry_request'],
          reasons: ['recent_provider_failures'],
          hooks: {
            lifecycleHooks: ['onTaskStart', 'onTaskEnd'],
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
            lifecycleHooks: ['onTaskStart', 'onTaskEnd'],
            timeoutAction: 'kill',
            cleanupScope: 'process',
            supportsCheckpointing: false,
            supportsSuspend: false,
          },
        },
      ],
    }),
  });
});

test('GET /api/runtime/resilience returns typed resilience audit inventory', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/runtime/resilience?token=${TOKEN}`);
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.equal(payload.inventory.summary.openIncidents, 2);
    assert.equal(payload.inventory.summary.notifications, 4);
    assert.equal(payload.inventory.events[0].target, 'storage');
    assert.equal(payload.inventory.throttles[0].mode, 'pause_mutations');
    assert.equal(payload.inventory.notifications[0].title, 'Storage is degraded');
  }, {
    runtimeResilienceLoader: async () => ({
      generatedAt: '2026-03-12T10:37:00.000Z',
      summary: {
        totalEvents: 2,
        openIncidents: 2,
        recoveryEvents: 0,
        notifications: 4,
        throttles: 2,
        offlineProviders: 1,
        degradedProviders: 0,
        storageStatus: 'degraded',
      },
      events: [
        {
          id: 'storage:degraded_entered',
          scope: 'storage',
          target: 'storage',
          status: 'degraded',
          transition: 'degraded_entered',
          severity: 'warning',
          recordedAt: '2026-03-12T10:36:00.000Z',
          reasons: ['primary_storage_unavailable'],
          recommendedAction: 'continue_with_fallback_storage',
        },
        {
          id: 'provider:claude:offline_entered',
          scope: 'provider',
          target: 'claude',
          status: 'offline',
          transition: 'offline_entered',
          severity: 'critical',
          recordedAt: '2026-03-12T10:35:00.000Z',
          reasons: ['provider_circuit_open'],
          recommendedAction: 'switch_to_local_model_provider',
        },
      ],
      notifications: [
        {
          id: 'notification:storage:degraded_entered',
          kind: 'operator_notice',
          severity: 'warning',
          scope: 'storage',
          target: 'storage',
          title: 'Storage is degraded',
          message: 'Recommended action: continue with fallback storage.',
          suggestedAction: 'continue_with_fallback_storage',
          throttleMode: null,
          eventIds: ['storage:degraded_entered'],
        },
        {
          id: 'notification:provider:claude:offline_entered',
          kind: 'operator_banner',
          severity: 'critical',
          scope: 'provider',
          target: 'claude',
          title: 'Claude went offline',
          message: 'Recommended action: switch to local model provider.',
          suggestedAction: 'switch_to_local_model_provider',
          throttleMode: null,
          eventIds: ['provider:claude:offline_entered'],
        },
        {
          id: 'notification:throttle:storage:degraded_entered',
          kind: 'throttle_recommendation',
          severity: 'warning',
          scope: 'storage',
          target: 'storage',
          title: 'Storage throttle: pause mutations',
          message: 'Storage is degraded; reduce mutation pressure while fallback mode is active.',
          suggestedAction: 'continue_with_fallback_storage',
          throttleMode: 'pause_mutations',
          eventIds: ['storage:degraded_entered'],
        },
        {
          id: 'notification:throttle:provider:claude:offline',
          kind: 'throttle_recommendation',
          severity: 'critical',
          scope: 'provider',
          target: 'claude',
          title: 'Claude throttle: shift to fallback',
          message: 'Route new work away from claude until outage conditions clear.',
          suggestedAction: 'switch_to_local_model_provider',
          throttleMode: 'shift_to_fallback',
          eventIds: ['provider:claude:offline_entered'],
        },
      ],
      throttles: [
        {
          id: 'throttle:storage:degraded_entered',
          scope: 'storage',
          target: 'storage',
          mode: 'pause_mutations',
          reason: 'Storage is degraded; reduce mutation pressure while fallback mode is active.',
          action: 'continue_with_fallback_storage',
          eventIds: ['storage:degraded_entered'],
        },
        {
          id: 'throttle:provider:claude:offline',
          scope: 'provider',
          target: 'claude',
          mode: 'shift_to_fallback',
          reason: 'Route new work away from claude until outage conditions clear.',
          action: 'switch_to_local_model_provider',
          eventIds: ['provider:claude:offline_entered'],
        },
      ],
    }),
  });
});

test('GET /api/runtime/fallbacks returns typed offline fallback inventory', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/runtime/fallbacks?token=${TOKEN}`);
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.equal(payload.inventory.offlineReady, true);
    assert.equal(payload.inventory.storage.fallbackMode, 'json_backup');
    assert.equal(payload.inventory.providers.lead, 'claude');
    assert.equal(payload.inventory.summary.localModelFallbackCount, 1);
    assert.equal(payload.inventory.providers.candidates[0].provider, 'opencode');
  }, {
    runtimeFallbacksLoader: async () => ({
      generatedAt: '2026-03-12T10:40:00.000Z',
      offlineReady: true,
      summary: {
        storageOffline: false,
        fallbackCandidateCount: 1,
        localModelFallbackCount: 1,
        providerOfflineCount: 0,
      },
      storage: {
        status: 'degraded',
        effectiveMode: 'json-backup',
        policyState: 'forced_json',
        failureRatio: 0.5,
        reasons: ['primary_storage_unavailable'],
        fallbackMode: 'json_backup',
        availableActions: ['continue_with_fallback_storage', 'retry_primary_storage'],
      },
      providers: {
        lead: 'claude',
        leadStatus: 'degraded',
        readyCount: 1,
        degradedCount: 1,
        offlineCount: 0,
        localModelCapableCount: 1,
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
        ],
      },
    }),
  });
});

test('GET /api/consilium/observability returns latest consilium snapshot', async () => {
  const previousState = JSON.parse(JSON.stringify(state));
  state.consiliumObservability = buildConsiliumObservabilitySnapshot({
    runId: 'run-consilium-1',
    topic: 'Validate roadmap',
    aliasMap: new Map([
      ['claude', 'Participant A'],
      ['gemini', 'Participant B'],
    ]),
    totalDurationMs: 1800,
    structured: true,
    rounds: [
      {
        round: 1,
        responses: [
          { provider: 'claude', alias: 'Participant A', status: 'success', response_ms: 700 },
          { provider: 'gemini', alias: 'Participant B', status: 'success', response_ms: 900 },
        ],
      },
    ],
    aggregatedTrustScores: {
      'Participant A': { B: 0.8 },
    },
    claimGraph: {
      stats: {
        total: 2,
        consensus_count: 1,
        contested_count: 1,
        unique_count: 0,
        contention_ratio: 0.5,
      },
    },
    synthesis: {
      provider: 'claude',
      status: 'success',
      parsed: {
        confidence: 0.75,
        recommendation: 'Proceed with the current plan.',
        consensus_points: ['Phase 0 complete'],
        disputed_points: [],
      },
    },
  }, {
    generatedAt: '2026-03-12T07:10:00.000Z',
  });

  try {
    await withServer(async (base) => {
      const response = await fetch(`${base}/api/consilium/observability?token=${TOKEN}`);
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.observability.topic, 'Validate roadmap');
      assert.equal(payload.observability.rounds[0].successfulResponses, 2);
      assert.equal(payload.observability.claimGraph.consensusCount, 1);
      assert.equal(payload.observability.trustMatrix[0].scores[0].score, 0.8);
    });
  } finally {
    for (const key of Object.keys(state)) {
      delete state[key];
    }
    Object.assign(state, previousState);
  }
});

test('GET /api/consilium/replay returns typed archive history and selected round replay', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ctx-consilium-replay-http-'));
  const store = createEvalStore(dir);

  try {
    const firstRun = store.startRun({
      project: 'ctx-replay',
      topic: 'Stabilize replay contract',
      providers: ['claude', 'gemini'],
    });
    store.addProviderResponse(firstRun, {
      provider: 'claude',
      status: 'completed',
      response_ms: 900,
      confidence: 0.81,
      key_idea: 'Keep replay typed',
    });
    store.addProviderResponse(firstRun, {
      provider: 'gemini',
      status: 'completed',
      response_ms: 1100,
      confidence: 0.67,
      key_idea: 'Link archive refs',
    });
    store.addRoundResponse(firstRun, {
      round: 1,
      provider: 'claude',
      alias: 'Participant A',
      status: 'completed',
      response_ms: 900,
      response_text: 'Claude replay round',
      confidence: 0.81,
      position_changed: 0,
    });
    store.addRoundResponse(firstRun, {
      round: 1,
      provider: 'gemini',
      alias: 'Participant B',
      status: 'completed',
      response_ms: 1100,
      response_text: 'Gemini replay round',
      confidence: 0.67,
      position_changed: 1,
    });
    store.completeRun(firstRun, {
      proposed_by: 'claude',
      consensus: 1,
      rounds: 1,
      decision_summary: 'Typed replay contract is the chosen archive surface.',
      github_issue_url: 'https://github.com/VladPatr96/my_claude_code/issues/447',
    });

    await new Promise((resolve) => setTimeout(resolve, 5));

    const secondRun = store.startRun({
      project: 'ctx-replay',
      topic: 'Measure replay freshness',
      providers: ['claude', 'codex'],
    });
    store.addProviderResponse(secondRun, {
      provider: 'codex',
      status: 'completed',
      response_ms: 700,
      confidence: 0.73,
      key_idea: 'Keep route project scoped',
    });
    store.addRoundResponse(secondRun, {
      round: 1,
      provider: 'codex',
      alias: 'Participant A',
      status: 'completed',
      response_ms: 700,
      response_text: 'Codex replay round',
      confidence: 0.73,
      position_changed: 0,
    });
    store.completeRun(secondRun, {
      proposed_by: 'codex',
      consensus: 0,
      rounds: 1,
      decision_summary: 'Latest replay route should default to the most recent run.',
    });

    await withServer(async (base) => {
      const listResponse = await fetch(`${base}/api/consilium/replay?token=${TOKEN}&project=ctx-replay&last=5`);
      assert.equal(listResponse.status, 200);
      const listPayload = await listResponse.json();
      assert.equal(listPayload.archive.decisions.length, 2);
      assert.equal(listPayload.archive.selectedRunId, secondRun);
      assert.equal(listPayload.archive.replay.decision.runId, secondRun);

      const detailResponse = await fetch(`${base}/api/consilium/replay?token=${TOKEN}&project=ctx-replay&run_id=${encodeURIComponent(firstRun)}`);
      assert.equal(detailResponse.status, 200);
      const detailPayload = await detailResponse.json();
      assert.equal(detailPayload.archive.selectedRunId, firstRun);
      assert.equal(detailPayload.archive.replay.decision.runId, firstRun);
      assert.equal(detailPayload.archive.filters.applied.project, 'ctx-replay');
      assert.equal(detailPayload.archive.replay.rounds[0].responses[1].positionChanged, true);
      assert.equal(
        detailPayload.archive.replay.decision.archiveReferences.some((reference) => reference.type === 'github_issue'),
        true,
      );

      const filteredResponse = await fetch(
        `${base}/api/consilium/replay?token=${TOKEN}&project=ctx-replay&provider=claude&consensus=consensus`,
      );
      assert.equal(filteredResponse.status, 200);
      const filteredPayload = await filteredResponse.json();
      assert.equal(filteredPayload.archive.decisions.length, 1);
      assert.equal(filteredPayload.archive.filters.applied.provider, 'claude');
      assert.equal(filteredPayload.archive.filters.applied.consensus, 'consensus');
      assert.equal(filteredPayload.archive.filters.consensusCounts.open, 1);

      const exportResponse = await fetch(
        `${base}/api/consilium/replay/export?token=${TOKEN}&run_id=${encodeURIComponent(firstRun)}&format=markdown&project=ctx-replay&provider=claude&consensus=consensus`,
      );
      assert.equal(exportResponse.status, 200);
      const exportPayload = await exportResponse.json();
      assert.equal(exportPayload.export.format, 'markdown');
      assert.match(exportPayload.export.filename, /\.md$/);
      assert.match(exportPayload.export.content, /# Consilium Decision Trail/);
    }, {
      evalStore: store,
    });
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('GET /api/consilium/replay links selected replay with knowledge search context', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ctx-consilium-replay-kb-http-'));
  const kbDir = mkdtempSync(join(tmpdir(), 'ctx-consilium-replay-kb-store-'));
  const store = createEvalStore(dir);
  const previousKbPath = process.env.CTX_KB_PATH;
  const previousKbDisabled = process.env.CTX_KB_DISABLED;

  process.env.CTX_KB_PATH = join(kbDir, 'knowledge.sqlite');
  delete process.env.CTX_KB_DISABLED;
  await resetDashboardRuntimeCachesForTests();

  try {
    const runId = store.startRun({
      project: 'ctx-replay-kb',
      topic: 'Link replay archive with knowledge context',
      providers: ['claude', 'gemini'],
    });
    store.addProviderResponse(runId, {
      provider: 'claude',
      status: 'completed',
      response_ms: 820,
      confidence: 0.83,
      key_idea: 'Persist linked knowledge references in the replay surface',
    });
    store.addProviderResponse(runId, {
      provider: 'gemini',
      status: 'completed',
      response_ms: 910,
      confidence: 0.7,
      key_idea: 'Use project scoped knowledge search for archived decisions',
    });
    store.addRoundResponse(runId, {
      round: 1,
      provider: 'claude',
      alias: 'Participant A',
      status: 'completed',
      response_ms: 820,
      response_text: 'Add knowledge links directly to the replay panel.',
      confidence: 0.83,
      position_changed: 0,
    });
    store.completeRun(runId, {
      proposed_by: 'claude',
      consensus: 1,
      rounds: 1,
      decision_summary: 'Link the selected replay with project knowledge search and continuity hints.',
    });

    await withServer(async (base) => {
      const saveDecision = await fetch(`${base}/api/kb/save?token=${TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: 'ctx-replay-kb',
          category: 'decision',
          title: 'Replay knowledge linkage decision',
          body: 'Link replay archive with project knowledge search and continuity hints for archived decisions.',
          source: 'github-issues',
          github_url: 'https://github.com/VladPatr96/my_claude_code/issues/450',
        }),
      });
      assert.equal(saveDecision.status, 200);

      const saveSession = await fetch(`${base}/api/kb/save?token=${TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: 'ctx-replay-kb',
          category: 'session-summary',
          title: 'Replay linkage rollout session',
          body: 'Persist linked knowledge references in the replay surface and keep project scoped search deterministic.',
          source: 'ctx-session-save',
        }),
      });
      assert.equal(saveSession.status, 200);

      const replayResponse = await fetch(
        `${base}/api/consilium/replay?token=${TOKEN}&project=ctx-replay-kb&run_id=${encodeURIComponent(runId)}`,
      );
      assert.equal(replayResponse.status, 200);
      const replayPayload = await replayResponse.json();
      const knowledgeContext = replayPayload.archive.replay.knowledgeContext;
      assert.equal(knowledgeContext.project, 'ctx-replay-kb');
      assert.match(knowledgeContext.query, /knowledge/i);
      assert.equal(knowledgeContext.actions.length, 2);
      assert.match(knowledgeContext.actions[0].href, /\?tab=knowledge/);
      assert.ok(knowledgeContext.entries.some((entry) => entry.title === 'Replay knowledge linkage decision'));
      assert.ok(knowledgeContext.entries.every((entry) => entry.href.includes('kb_project=ctx-replay-kb')));
      assert.equal(knowledgeContext.continuity.snapshotExists, false);
    }, {
      evalStore: store,
    });
  } finally {
    await resetDashboardRuntimeCachesForTests();
    if (previousKbPath === undefined) delete process.env.CTX_KB_PATH;
    else process.env.CTX_KB_PATH = previousKbPath;
    if (previousKbDisabled === undefined) delete process.env.CTX_KB_DISABLED;
    else process.env.CTX_KB_DISABLED = previousKbDisabled;
    store.close();
    rmSync(dir, { recursive: true, force: true });
    rmSync(kbDir, { recursive: true, force: true });
  }
});

test('KB save/search routes work with token auth', async () => {
  const kbDir = mkdtempSync(join(tmpdir(), 'ctx-kb-http-'));
  process.env.CTX_KB_PATH = join(kbDir, 'knowledge.sqlite');
  delete process.env.CTX_KB_DISABLED;
  await resetDashboardRuntimeCachesForTests();

  await withServer(async (base) => {
    const saveResponse = await fetch(`${base}/api/kb/save?token=${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: 'ctx-test',
        category: 'solution',
        title: 'KB HTTP smoke',
        body: 'KB endpoint should save and return searchable content'
      })
    });

    assert.equal(saveResponse.status, 200);
    const saved = await saveResponse.json();
    assert.equal(saved.ok, true);

    const searchResponse = await fetch(`${base}/api/kb/search?q=searchable&token=${TOKEN}`);
    assert.equal(searchResponse.status, 200);
    const search = await searchResponse.json();
    assert.ok(Array.isArray(search.entries));
    assert.ok(search.entries.length >= 1);
    assert.equal(search.entries[0].retrieval.strategy, 'hybrid');
  });

  await resetDashboardRuntimeCachesForTests();
});

test('GET /api/kb/continuity/:project returns continuity digest with snapshot metadata', async () => {
  const kbDir = mkdtempSync(join(tmpdir(), 'ctx-kb-continuity-http-'));
  process.env.CTX_KB_PATH = join(kbDir, 'knowledge.sqlite');
  delete process.env.CTX_KB_DISABLED;
  await resetDashboardRuntimeCachesForTests();

  await withServer(async (base) => {
    const saveDecision = await fetch(`${base}/api/kb/save?token=${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: 'ctx-continuity',
        category: 'decision',
        title: 'Keep continuity digest',
        body: 'The dashboard should expose continuity digest per project.'
      })
    });
    assert.equal(saveDecision.status, 200);

    const runtimeStatePath = `${base}/api/kb/save?token=${TOKEN}`;
    const saveSession = await fetch(runtimeStatePath, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: 'ctx-continuity',
        category: 'session-summary',
        title: 'Session digest seed',
        body: 'Most recent session prepared a continuity view.'
      })
    });
    assert.equal(saveSession.status, 200);

    const { createKnowledgeStore } = await import('../scripts/knowledge/kb-json-fallback.js');
    const runtime = await createKnowledgeStore({ dbPath: process.env.CTX_KB_PATH });
    runtime.store.saveSnapshot('ctx-continuity', {
      branch: 'codex/continuity',
      task: 'Render continuity digest',
      stage: 'execute'
    });
    runtime.store.close?.();

    const continuityResponse = await fetch(`${base}/api/kb/continuity/ctx-continuity?token=${TOKEN}&limit=3`);
    assert.equal(continuityResponse.status, 200);
    const payload = await continuityResponse.json();
    assert.equal(payload.project, 'ctx-continuity');
    assert.equal(payload.digest.project, 'ctx-continuity');
    assert.equal(payload.digest.snapshot.exists, true);
    assert.equal(payload.digest.snapshot.branch, 'codex/continuity');
    assert.ok(payload.digest.suggestions.some((suggestion) => suggestion.type === 'resume'));
  });

  await resetDashboardRuntimeCachesForTests();
});

test('GET /api/kb/quality returns archive quality summary with project gaps', async () => {
  const kbDir = mkdtempSync(join(tmpdir(), 'ctx-kb-quality-http-'));
  process.env.CTX_KB_PATH = join(kbDir, 'knowledge.sqlite');
  delete process.env.CTX_KB_DISABLED;
  await resetDashboardRuntimeCachesForTests();

  await withServer(async (base) => {
    await fetch(`${base}/api/kb/save?token=${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: 'ctx-quality',
        category: 'decision',
        title: 'Quality decision',
        body: 'Archive quality should be measurable.'
      })
    });

    const response = await fetch(`${base}/api/kb/quality?token=${TOKEN}&stale_days=30`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.summary.totals.totalProjects, 1);
    assert.ok(payload.summary.categoryCoverage.some((item) => item.category === 'decision'));
    assert.ok(payload.summary.gaps.some((gap) => gap.project === 'ctx-quality' && gap.type === 'snapshot_missing'));
  });

  await resetDashboardRuntimeCachesForTests();
});

test('GET /api/kb/export/:project returns project export artifact', async () => {
  const kbDir = mkdtempSync(join(tmpdir(), 'ctx-kb-export-http-'));
  process.env.CTX_KB_PATH = join(kbDir, 'knowledge.sqlite');
  delete process.env.CTX_KB_DISABLED;
  await resetDashboardRuntimeCachesForTests();

  await withServer(async (base) => {
    await fetch(`${base}/api/kb/save?token=${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: 'ctx-export',
        category: 'session-summary',
        title: 'Export session',
        body: 'Prepare a knowledge export artifact.'
      })
    });
    await fetch(`${base}/api/kb/save?token=${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: 'ctx-export',
        category: 'decision',
        title: 'Export decision',
        body: 'The export route should include grouped decision history.'
      })
    });

    const { createKnowledgeStore } = await import('../scripts/knowledge/kb-json-fallback.js');
    const runtime = await createKnowledgeStore({ dbPath: process.env.CTX_KB_PATH });
    runtime.store.saveSnapshot('ctx-export', {
      branch: 'codex/export',
      task: 'Render export artifact',
      stage: 'execute'
    });
    runtime.store.close?.();

    const response = await fetch(`${base}/api/kb/export/ctx-export?token=${TOKEN}&limit=3&stale_days=30`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.artifact.project, 'ctx-export');
    assert.equal(payload.artifact.snapshot.exists, true);
    assert.ok(payload.artifact.sections.some((section) => section.category === 'decision'));
    assert.equal(payload.artifact.continuity.project, 'ctx-export');
  });

  await resetDashboardRuntimeCachesForTests();
});

test('GET /api/kb/suggestions/:project returns archive-backed suggestions and templates', async () => {
  const kbDir = mkdtempSync(join(tmpdir(), 'ctx-kb-suggestions-http-'));
  process.env.CTX_KB_PATH = join(kbDir, 'knowledge.sqlite');
  delete process.env.CTX_KB_DISABLED;
  await resetDashboardRuntimeCachesForTests();

  await withServer(async (base) => {
    await fetch(`${base}/api/kb/save?token=${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: 'ctx-suggest',
        category: 'session-summary',
        title: 'Suggest session',
        body: 'Continue this saved session context.'
      })
    });
    await fetch(`${base}/api/kb/save?token=${TOKEN}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        project: 'ctx-suggest',
        category: 'decision',
        title: 'Suggest decision',
        body: 'Use the archived decision as a template source.'
      })
    });

    const { createKnowledgeStore } = await import('../scripts/knowledge/kb-json-fallback.js');
    const runtime = await createKnowledgeStore({ dbPath: process.env.CTX_KB_PATH });
    runtime.store.saveSnapshot('ctx-suggest', {
      branch: 'codex/suggest',
      task: 'Render suggestion artifact',
      stage: 'execute'
    });
    runtime.store.close?.();

    const response = await fetch(`${base}/api/kb/suggestions/ctx-suggest?token=${TOKEN}&limit=3`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.summary.project, 'ctx-suggest');
    assert.ok(payload.summary.suggestions.some((suggestion) => suggestion.action === 'resume_context'));
    assert.ok(payload.summary.templates.some((template) => template.sourceCategories.includes('decision')));
  });

  await resetDashboardRuntimeCachesForTests();
});

test('SSE connect sends retry and replays events after Last-Event-Id', () => {
  const before = state.lastEventId;
  broadcast('log', { seq: 'a' });
  broadcast('log', { seq: 'b' });

  const req = new EventEmitter();
  req.headers = { 'last-event-id': String(before + 1) };

  const writes = [];
  const res = {
    writeHead() {},
    write(chunk) {
      writes.push(String(chunk));
      return true;
    }
  };

  sseConnect(req, res, () => ({ snapshot: true }), new URL('http://localhost/events'));
  req.emit('close');

  const payload = writes.join('');
  assert.match(payload, /retry: 3000/);
  assert.match(payload, /"seq":"b"/);
  assert.doesNotMatch(payload, /"snapshot":true/);
});

test('router serves static dist index when staticDir is configured', async () => {
  const staticDir = mkdtempSync(join(tmpdir(), 'ctx-static-'));
  writeFileSync(join(staticDir, 'index.html'), '<!doctype html><html><body>static-ok</body></html>', 'utf8');
  writeFileSync(join(staticDir, 'manifest.webmanifest'), '{"name":"ctx"}', 'utf8');

  const router = createRouter(() => '<html><body>legacy</body></html>', TOKEN, { staticDir });
  const server = http.createServer((req, res) => {
    Promise.resolve(router(req, res)).catch((error) => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
      }
      res.end(JSON.stringify({ error: error?.message || 'router_error' }));
    });
  });

  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  const base = `http://127.0.0.1:${address.port}`;

  try {
    const root = await fetch(`${base}/`);
    assert.equal(root.status, 200);
    const html = await root.text();
    assert.match(html, /static-ok/);

    const manifest = await fetch(`${base}/manifest.webmanifest`);
    assert.equal(manifest.status, 200);
    const text = await manifest.text();
    assert.match(text, /"name":"ctx"/);
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('dashboard health surface keeps public health and protected operator endpoints distinct', async () => {
  await withServer(async (base) => {
    const health = await fetch(`${base}/health`);
    assert.equal(health.status, 200);
    assert.equal(await health.text(), 'OK');

    const storageUnauthorized = await fetch(`${base}/storage-health`);
    assert.equal(storageUnauthorized.status, 401);

    const sessionsUnauthorized = await fetch(`${base}/api/terminal/sessions`);
    assert.equal(sessionsUnauthorized.status, 401);

    const sessionsAuthorized = await fetch(`${base}/api/terminal/sessions?token=${TOKEN}`);
    assert.equal(sessionsAuthorized.status, 200);
    const payload = await sessionsAuthorized.json();
    assert.ok(Array.isArray(payload.sessions));
  });
});

test('GET /api/analytics/summary returns normalized dashboard analytics payload', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/analytics/summary?token=${TOKEN}`);
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.equal(payload.summary.totals.totalCost, 1.25);
    assert.equal(payload.summary.budget.global.budget, 2);
    assert.equal(payload.summary.routing.totalDecisions, 8);
  }, {
    analyticsSummaryLoader: async () => ({
      generatedAt: '2026-03-11T15:00:00.000Z',
      totals: {
        totalCost: 1.25,
        totalRequests: 6,
        totalTokens: 4200,
        providerCount: 2,
        costPerRequest: 0.208333,
        projectedMonthlyCost: 5.4,
        projectionConfidence: 'medium',
      },
      providers: [],
      timeline: {
        granularity: 'day',
        days: 7,
        points: [],
      },
      recommendations: [],
      budget: {
        hasAlerts: false,
        thresholds: {
          warning: 0.8,
          critical: 0.95,
        },
        global: {
          scope: 'global',
          key: null,
          status: 'ok',
          budget: 2,
          currentCost: 1.25,
          remaining: 0.75,
          percentUsed: 62.5,
          alert: null,
        },
        providers: [],
      },
      routing: {
        available: true,
        totalDecisions: 8,
        anomalyCount: 0,
        divergedCount: 1,
        dominantProvider: 'claude',
        lastDecisionAt: '2026-03-11T14:50:00.000Z',
      },
      gaps: [],
    })
  });
});

test('GET /api/routing/explainability returns normalized explainability payload', async () => {
  await withServer(async (base) => {
    const response = await fetch(`${base}/api/routing/explainability?token=${TOKEN}&last=10&since_days=7`);
    assert.equal(response.status, 200);
    const payload = await response.json();

    assert.equal(payload.summary.mode, 'adaptive');
    assert.equal(payload.summary.totals.feedbackCount, 2);
    assert.equal(payload.summary.decisions[0].feedback.verdict, 'negative');
  }, {
    routingExplainabilityLoader: async () => ({
      generatedAt: '2026-03-11T16:00:00.000Z',
      mode: 'adaptive',
      readiness: {
        totalRuns: 60,
        isReady: true,
        alpha: 0.21,
        adaptiveEnabled: true,
      },
      totals: {
        totalDecisions: 14,
        decisionCount: 1,
        feedbackCount: 2,
        negativeFeedbackCount: 1,
      },
      anomalies: [],
      distribution: [{ selected_provider: 'claude', cnt: 8 }],
      decisions: [{
        id: 11,
        timestamp: '2026-03-11T15:55:00.000Z',
        taskType: 'planning',
        selectedProvider: 'claude',
        runnerUp: 'gemini',
        routingMode: 'adaptive',
        finalScore: 0.88,
        scoreMargin: 0.12,
        diverged: true,
        contributions: {
          static: 0.55,
          evaluation: 0.21,
          feedback: 0.05,
          exploration: 0.02,
        },
        explanation: {
          headline: 'claude selected adaptively for planning',
          summary: 'Adaptive routing selected claude for planning.',
          factors: ['Adaptive routing selected claude for planning.'],
        },
        feedback: {
          verdict: 'negative',
          total: 2,
          positive: 1,
          neutral: 0,
          negative: 1,
          note: 'Too slow',
          lastSubmittedAt: '2026-03-11T15:56:00.000Z',
        },
      }],
      feedback: {
        total: 2,
        positive: 1,
        neutral: 0,
        negative: 1,
        byProvider: [{
          provider: 'claude',
          total: 2,
          positive: 1,
          neutral: 0,
          negative: 1,
          score: 0.5,
        }],
      },
    })
  });
});

test('POST /api/routing/feedback persists explicit operator verdicts through eval store', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ctx-routing-feedback-http-'));
  const store = createEvalStore(dir);
  try {
    store.insertRoutingDecision({
      timestamp: '2026-03-11T15:00:00.000Z',
      task_snippet: 'Plan routing improvements',
      task_type: 'planning',
      selected_provider: 'claude',
      runner_up: 'gemini',
      final_score: 0.9,
      static_component: 0.6,
      eval_component: 0.2,
      feedback_component: 0,
      explore_component: 0.02,
      alpha: 0.18,
      delta: 0.1,
      is_diverged: 0,
      routing_mode: 'adaptive',
    });
    const decision = store.getRoutingHealth({ last: 5, sinceDays: 30 }).decisions[0];

    await withServer(async (base) => {
      const response = await fetch(`${base}/api/routing/feedback?token=${TOKEN}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          decisionId: decision.id,
          verdict: 'positive',
          provider: 'claude',
          taskType: 'planning',
        })
      });

      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.record.decisionId, decision.id);
      assert.equal(payload.record.verdict, 'positive');
    }, {
      evalStore: store,
    });

    const feedback = store.getRoutingFeedbackSummary({ sinceDays: 30, decisionIds: [decision.id] });
    assert.equal(feedback.total, 1);
    assert.equal(feedback.positive, 1);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
