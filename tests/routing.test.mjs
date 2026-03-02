import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createEvalStore } from '../scripts/evaluation/eval-store.js';
import { writeJsonAtomic, readJsonFile } from '../scripts/utils/state-io.js';

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'ctx-routing-test-'));
}

// ---- Readiness gate ----

test('getReadiness: < 50 completed runs → not ready', () => {
  const dir = makeTempDir();
  try {
    const store = createEvalStore(dir);
    // Add 10 runs, all completed
    for (let i = 0; i < 10; i++) {
      const runId = store.startRun({ project: 'test', topic: `topic-${i}` });
      store.completeRun(runId, { proposed_by: 'claude', rounds: 1 });
    }
    const readiness = store.getReadiness();
    assert.equal(readiness.totalRuns, 10);
    assert.equal(readiness.isReady, false);
    assert.equal(readiness.adaptiveEnabled, false);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('getReadiness: >= 50 completed runs → ready', () => {
  const dir = makeTempDir();
  try {
    const store = createEvalStore(dir);
    for (let i = 0; i < 55; i++) {
      const runId = store.startRun({ project: 'test', topic: `topic-${i}` });
      store.completeRun(runId, { proposed_by: 'claude', rounds: 1 });
    }
    const readiness = store.getReadiness();
    assert.equal(readiness.totalRuns, 55);
    assert.equal(readiness.isReady, true);
    assert.ok(readiness.alpha > 0);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('getReadiness: env var CTX_ADAPTIVE_ROUTING=0 → adaptiveEnabled false even with 50+ runs', () => {
  const dir = makeTempDir();
  const original = process.env.CTX_ADAPTIVE_ROUTING;
  try {
    process.env.CTX_ADAPTIVE_ROUTING = '0';
    const store = createEvalStore(dir);
    for (let i = 0; i < 55; i++) {
      const runId = store.startRun({ project: 'test', topic: `topic-${i}` });
      store.completeRun(runId, { proposed_by: 'claude', rounds: 1 });
    }
    const readiness = store.getReadiness();
    assert.equal(readiness.isReady, true);
    assert.equal(readiness.adaptiveEnabled, false);
    store.close();
  } finally {
    if (original === undefined) delete process.env.CTX_ADAPTIVE_ROUTING;
    else process.env.CTX_ADAPTIVE_ROUTING = original;
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- Per-task-type metrics ----

test('getProviderMetricsByTaskType: returns metrics filtered by task_type', () => {
  const dir = makeTempDir();
  try {
    const store = createEvalStore(dir);

    // Create runs with different task_types
    const run1 = store.startRun({ project: 'test', topic: 'code review' });
    store.addProviderResponse(run1, { provider: 'codex', status: 'completed', response_ms: 100, confidence: 0.9, task_type: 'code_review' });
    store.addProviderResponse(run1, { provider: 'gemini', status: 'completed', response_ms: 200, confidence: 0.7, task_type: 'code_review' });
    store.completeRun(run1, { proposed_by: 'codex', rounds: 1 });

    const run2 = store.startRun({ project: 'test', topic: 'analyze project' });
    store.addProviderResponse(run2, { provider: 'gemini', status: 'completed', response_ms: 300, confidence: 0.95, task_type: 'codebase_analysis' });
    store.addProviderResponse(run2, { provider: 'codex', status: 'completed', response_ms: 500, confidence: 0.5, task_type: 'codebase_analysis' });
    store.completeRun(run2, { proposed_by: 'gemini', rounds: 1 });

    // Check code_review metrics
    const crMetrics = store.getProviderMetricsByTaskType('code_review');
    assert.ok(crMetrics.providers.has('codex'));
    assert.ok(crMetrics.providers.has('gemini'));
    assert.equal(crMetrics.providers.get('codex').total_responses, 1);

    // Check codebase_analysis metrics
    const caMetrics = store.getProviderMetricsByTaskType('codebase_analysis');
    assert.ok(caMetrics.providers.has('gemini'));
    assert.equal(caMetrics.providers.get('gemini').total_responses, 1);

    // Unknown task_type returns empty
    const unknownMetrics = store.getProviderMetricsByTaskType('unknown_type');
    assert.equal(unknownMetrics.providers.size, 0);

    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- addProviderResponse with task_type ----

test('addProviderResponse: task_type is nullable', () => {
  const dir = makeTempDir();
  try {
    const store = createEvalStore(dir);
    const runId = store.startRun({ project: 'test', topic: 'test' });

    // Without task_type (null default)
    store.addProviderResponse(runId, { provider: 'claude', status: 'completed' });
    // With task_type
    store.addProviderResponse(runId, { provider: 'gemini', status: 'completed', task_type: 'planning' });

    store.completeRun(runId, { proposed_by: 'claude', rounds: 1 });

    const planningMetrics = store.getProviderMetricsByTaskType('planning');
    assert.equal(planningMetrics.providers.get('gemini')?.total_responses, 1);
    assert.ok(!planningMetrics.providers.has('claude'));

    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- Routing config override ----

test('routing config: override file read/write', () => {
  const dir = makeTempDir();
  try {
    const configFile = join(dir, 'routing-config.json');

    // Write a config with overrides
    writeJsonAtomic(configFile, {
      enabled: true,
      threshold: 0.5,
      overrides: {
        code_review: { provider: 'gemini', remaining: 5 }
      }
    });

    const config = readJsonFile(configFile, {});
    assert.equal(config.enabled, true);
    assert.equal(config.threshold, 0.5);
    assert.equal(config.overrides.code_review.provider, 'gemini');
    assert.equal(config.overrides.code_review.remaining, 5);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- Per-task-type metrics caching ----

test('getProviderMetricsByTaskType: cached for same taskType', () => {
  const dir = makeTempDir();
  try {
    const store = createEvalStore(dir);
    const runId = store.startRun({ project: 'test', topic: 'review' });
    store.addProviderResponse(runId, { provider: 'codex', status: 'completed', response_ms: 100, task_type: 'code_review' });
    store.completeRun(runId, { proposed_by: 'codex', rounds: 1 });

    const m1 = store.getProviderMetricsByTaskType('code_review');
    const m2 = store.getProviderMetricsByTaskType('code_review');
    // Should be the same object reference (cached)
    assert.equal(m1, m2);

    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- Readiness alpha computation ----

test('getReadiness: alpha ramps linearly with run count', () => {
  const dir = makeTempDir();
  try {
    const store = createEvalStore(dir);
    // 25 runs → alpha = 25/100 * 0.35 = 0.0875
    for (let i = 0; i < 25; i++) {
      const runId = store.startRun({ project: 'test', topic: `t${i}` });
      store.completeRun(runId, { proposed_by: 'claude', rounds: 1 });
    }
    const r = store.getReadiness();
    assert.ok(Math.abs(r.alpha - 0.0875) < 0.001);
    store.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
