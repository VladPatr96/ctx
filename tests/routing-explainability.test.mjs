import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildRoutingExplainability } from '../scripts/analytics/routing-explainability.js';
import { createEvalStore } from '../src/evaluation/eval-store.js';

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'ctx-routing-explainability-'));
}

test('buildRoutingExplainability normalizes decisions and feedback summaries', async () => {
  const dir = makeTempDir();
  try {
    const store = createEvalStore(dir);
    const runId = store.startRun({ project: 'ctx', topic: 'review' });
    store.addProviderResponse(runId, {
      provider: 'claude',
      status: 'completed',
      response_ms: 120,
      confidence: 0.85,
      task_type: 'planning',
    });
    store.completeRun(runId, { proposed_by: 'claude', rounds: 1 });

    store.insertRoutingDecision({
      timestamp: '2026-03-11T14:10:00.000Z',
      task_snippet: 'Plan the runtime migration',
      task_type: 'planning',
      selected_provider: 'claude',
      runner_up: 'gemini',
      final_score: 0.88,
      static_component: 0.55,
      eval_component: 0.21,
      feedback_component: 0.06,
      explore_component: 0.02,
      alpha: 0.2,
      delta: 0.11,
      is_diverged: 1,
      routing_mode: 'adaptive',
    });

    const decision = store.getRoutingHealth({ last: 5, sinceDays: 30 }).decisions[0];
    const saved = store.addRoutingFeedback({
      decision_id: decision.id,
      verdict: 'negative',
      actor: 'dashboard',
      note: 'Too expensive for this task',
    });

    assert.equal(saved.ok, true);

    const summary = await buildRoutingExplainability({
      evalStore: store,
      dataDir: dir,
      now: '2026-03-11T15:00:00.000Z',
      last: 5,
      sinceDays: 30,
    });

    assert.equal(summary.mode, 'static');
    assert.equal(summary.feedback.total, 1);
    assert.equal(summary.feedback.negative, 1);
    assert.equal(summary.decisions.length, 1);
    assert.equal(summary.decisions[0].feedback.verdict, 'negative');
    assert.equal(summary.decisions[0].contributions.feedback, 0.06);
    assert.match(summary.decisions[0].explanation.headline, /claude/i);

    const metrics = store.getProviderMetrics().providers.get('claude');
    assert.equal(metrics.feedback_count, 1);
    assert.equal(metrics.feedback_negative, 1);
    assert.equal(metrics.feedback_score, 0);

    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('addRoutingFeedback is idempotent per decision and actor', () => {
  const dir = makeTempDir();
  try {
    const store = createEvalStore(dir);
    store.insertRoutingDecision({
      timestamp: '2026-03-11T14:10:00.000Z',
      task_snippet: 'Review the router',
      task_type: 'code_review',
      selected_provider: 'codex',
      runner_up: 'claude',
      final_score: 0.91,
      static_component: 0.6,
      eval_component: 0.24,
      feedback_component: 0,
      explore_component: 0.02,
      alpha: 0.18,
      delta: 0.09,
      is_diverged: 0,
      routing_mode: 'adaptive',
    });

    const decision = store.getRoutingHealth({ last: 5, sinceDays: 30 }).decisions[0];
    store.addRoutingFeedback({ decision_id: decision.id, verdict: 'positive', actor: 'dashboard' });
    store.addRoutingFeedback({ decision_id: decision.id, verdict: 'neutral', actor: 'dashboard' });

    const summary = store.getRoutingFeedbackSummary({ sinceDays: 30, decisionIds: [decision.id] });
    assert.equal(summary.total, 1);
    assert.equal(summary.positive, 0);
    assert.equal(summary.neutral, 1);
    assert.equal(summary.byDecision[decision.id].verdict, 'neutral');

    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
