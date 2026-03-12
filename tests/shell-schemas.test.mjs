import test from 'node:test';
import assert from 'node:assert/strict';
import { createShellSummary, ShellSummarySchema } from '../scripts/contracts/shell-schemas.js';

test('createShellSummary normalizes shell session, storage, and provider telemetry', () => {
  const summary = createShellSummary({
    pipeline: {
      stage: 'execute',
      lead: 'codex',
      task: 'Stabilize dashboard contracts',
      updatedAt: '2026-03-11T10:00:00.000Z',
      models: {
        claude: 'opus-4.6',
        gemini: 'gemini-2.5-pro',
      },
    },
    project: {
      name: 'claude_ctx',
      git: { branch: 'master' },
      stack: 'Node.js, ESM',
    },
    storageHealth: {
      mode: 'sqlite',
      effectiveMode: 'json-backup',
      policyState: 'forced_json',
      failureRatio: 0.375,
      failover: true,
      shadow: true,
      warningActive: true,
      ts: '2026-03-11T10:05:00.000Z',
      sources: {
        pipeline: { source: 'storage-adapter', backing: 'sqlite' },
        providerHealth: { source: 'dashboard-state-store-sidecar', path: '.data/provider-health.json' },
      },
    },
    providerHealth: {
      claude: {
        calls: 10,
        successes: 9,
        failures: 1,
        totalFailures: 1,
        avgLatencyMs: 180,
        lastLatencyMs: 220,
        lastSuccess: '2026-03-11T09:59:00.000Z',
        lastFailure: '2026-03-11T09:00:00.000Z',
        updatedAt: '2026-03-11T10:04:00.000Z',
      },
    },
  });

  assert.equal(summary.session.stage, 'execute');
  assert.equal(summary.project.branch, 'master');
  assert.equal(summary.storage.status, 'degraded');
  assert.equal(summary.storage.effectiveMode, 'json-backup');
  assert.equal(summary.storage.policyState, 'forced_json');
  assert.equal(summary.storage.failureRatio, 0.375);
  assert.equal(summary.storage.sourceCount, 2);
  assert.equal(summary.providers.models.claude, 'opus-4.6');
  assert.equal(summary.providers.cards.length, 2);

  const claudeCard = summary.providers.cards.find((card) => card.provider === 'claude');
  assert.ok(claudeCard);
  assert.equal(claudeCard.status, 'degraded');
  assert.equal(claudeCard.consecutiveFailures, 1);
  assert.equal(claudeCard.circuitOpen, false);
  assert.equal(claudeCard.successRate, 90);
  assert.equal(claudeCard.failures, 1);
  assert.equal(claudeCard.hasTelemetry, true);

  assert.doesNotThrow(() => ShellSummarySchema.parse(summary));
});

test('createShellSummary keeps model-only providers and drops invalid provider ids', () => {
  const summary = createShellSummary({
    pipeline: {
      models: {
        codex: 'gpt-5-codex',
        'not/a-provider': 'bad',
      },
    },
    providerHealth: {
      opencode: {
        calls: '3',
        successes: '2',
        failures: '1',
        successRate: '66.6',
      },
      'bad/provider': {
        calls: 9,
      },
    },
  });

  assert.deepEqual(summary.providers.models, { codex: 'gpt-5-codex' });
  assert.deepEqual(
    summary.providers.cards.map((card) => card.provider),
    ['codex', 'opencode']
  );

  const codexCard = summary.providers.cards.find((card) => card.provider === 'codex');
  assert.ok(codexCard);
  assert.equal(codexCard.model, 'gpt-5-codex');
  assert.equal(codexCard.hasTelemetry, false);
  assert.equal(codexCard.status, 'ready');

  const opencodeCard = summary.providers.cards.find((card) => card.provider === 'opencode');
  assert.ok(opencodeCard);
  assert.equal(opencodeCard.status, 'degraded');
  assert.equal(opencodeCard.consecutiveFailures, 1);
});
