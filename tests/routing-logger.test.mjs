import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initRoutingLogger,
  logDecision,
  flush,
  getBufferSize,
  _resetForTest
} from '../scripts/evaluation/routing-logger.js';
import { detectAnomalies } from '../scripts/evaluation/routing-anomaly.js';

// ---- routing-logger ----

test('routing-logger: disabled when CTX_ADAPTIVE_ROUTING != 1', () => {
  _resetForTest();
  const originalEnv = process.env.CTX_ADAPTIVE_ROUTING;
  delete process.env.CTX_ADAPTIVE_ROUTING;

  const mockStore = { insertRoutingDecisionBatch: () => {} };
  initRoutingLogger(mockStore);

  logDecision({ task: 'test', taskType: 'review', selectedProvider: 'claude', finalScore: 0.8 });
  assert.equal(getBufferSize(), 0, 'should not buffer when disabled');

  process.env.CTX_ADAPTIVE_ROUTING = originalEnv;
  _resetForTest();
});

test('routing-logger: enabled → buffers decisions', () => {
  _resetForTest();
  const originalEnv = process.env.CTX_ADAPTIVE_ROUTING;
  process.env.CTX_ADAPTIVE_ROUTING = '1';

  const batches = [];
  const mockStore = { insertRoutingDecisionBatch: (b) => batches.push(b) };
  initRoutingLogger(mockStore);

  logDecision({ task: 'test task', taskType: 'review', selectedProvider: 'claude', finalScore: 0.8 });
  assert.equal(getBufferSize(), 1, 'should buffer one decision');

  logDecision({ task: 'another', taskType: 'planning', selectedProvider: 'gemini', finalScore: 0.7 });
  assert.equal(getBufferSize(), 2, 'should buffer two decisions');

  process.env.CTX_ADAPTIVE_ROUTING = originalEnv;
  _resetForTest();
});

test('routing-logger: flush writes batch and clears buffer', () => {
  _resetForTest();
  const originalEnv = process.env.CTX_ADAPTIVE_ROUTING;
  process.env.CTX_ADAPTIVE_ROUTING = '1';

  const batches = [];
  const mockStore = { insertRoutingDecisionBatch: (b) => batches.push([...b]) };
  initRoutingLogger(mockStore);

  logDecision({ task: 'task1', taskType: 'review', selectedProvider: 'claude', finalScore: 0.8 });
  logDecision({ task: 'task2', taskType: 'planning', selectedProvider: 'gemini', finalScore: 0.7 });
  flush();

  assert.equal(batches.length, 1, 'should have flushed once');
  assert.equal(batches[0].length, 2, 'batch should contain 2 records');
  assert.equal(getBufferSize(), 0, 'buffer should be empty after flush');

  process.env.CTX_ADAPTIVE_ROUTING = originalEnv;
  _resetForTest();
});

test('routing-logger: snippet truncation to 120 chars', () => {
  _resetForTest();
  const originalEnv = process.env.CTX_ADAPTIVE_ROUTING;
  process.env.CTX_ADAPTIVE_ROUTING = '1';

  const batches = [];
  const mockStore = { insertRoutingDecisionBatch: (b) => batches.push([...b]) };
  initRoutingLogger(mockStore);

  const longTask = 'x'.repeat(200);
  logDecision({ task: longTask, taskType: 'review', selectedProvider: 'claude', finalScore: 0.5 });
  flush();

  assert.equal(batches[0][0].task_snippet.length, 120, 'snippet should be truncated to 120');

  process.env.CTX_ADAPTIVE_ROUTING = originalEnv;
  _resetForTest();
});

test('routing-logger: delta computation', () => {
  _resetForTest();
  const originalEnv = process.env.CTX_ADAPTIVE_ROUTING;
  process.env.CTX_ADAPTIVE_ROUTING = '1';

  const batches = [];
  const mockStore = { insertRoutingDecisionBatch: (b) => batches.push([...b]) };
  initRoutingLogger(mockStore);

  logDecision({
    task: 'test', taskType: 'review',
    selectedProvider: 'claude', runnerUp: 'gemini',
    finalScore: 0.9, runnerUpScore: 0.7,
    staticComponent: 0.5, evalComponent: 0.3, exploreComponent: 0.1, alpha: 0.2,
    routingMode: 'adaptive'
  });
  flush();

  const record = batches[0][0];
  assert.ok(Math.abs(record.delta - 0.2) < 1e-10, `delta should be 0.2, got ${record.delta}`);
  assert.equal(record.runner_up, 'gemini');

  process.env.CTX_ADAPTIVE_ROUTING = originalEnv;
  _resetForTest();
});

test('routing-logger: is_diverged detection', () => {
  _resetForTest();
  const originalEnv = process.env.CTX_ADAPTIVE_ROUTING;
  process.env.CTX_ADAPTIVE_ROUTING = '1';

  const batches = [];
  const mockStore = { insertRoutingDecisionBatch: (b) => batches.push([...b]) };
  initRoutingLogger(mockStore);

  // Diverged: adaptive chose claude, but static would choose codex
  logDecision({
    task: 'test', taskType: 'review',
    selectedProvider: 'claude', staticBest: 'codex',
    finalScore: 0.8, routingMode: 'adaptive'
  });
  // Not diverged: same provider
  logDecision({
    task: 'test2', taskType: 'planning',
    selectedProvider: 'claude', staticBest: 'claude',
    finalScore: 0.7, routingMode: 'adaptive'
  });
  flush();

  assert.equal(batches[0][0].is_diverged, 1, 'should be diverged');
  assert.equal(batches[0][1].is_diverged, 0, 'should not be diverged');

  process.env.CTX_ADAPTIVE_ROUTING = originalEnv;
  _resetForTest();
});

test('routing-logger: flush error does not throw', () => {
  _resetForTest();
  const originalEnv = process.env.CTX_ADAPTIVE_ROUTING;
  process.env.CTX_ADAPTIVE_ROUTING = '1';

  const mockStore = {
    insertRoutingDecisionBatch: () => { throw new Error('DB error'); }
  };
  initRoutingLogger(mockStore);

  logDecision({ task: 'test', taskType: 'review', selectedProvider: 'claude', finalScore: 0.5 });
  assert.doesNotThrow(() => flush(), 'flush should not throw on store error');

  process.env.CTX_ADAPTIVE_ROUTING = originalEnv;
  _resetForTest();
});

// ---- routing-anomaly ----

test('routing-anomaly: <20 decisions → empty', () => {
  const result = detectAnomalies(
    { avg_score: 0.8, min_score: 0.5, max_score: 0.9, avg_alpha: 0.1, min_alpha: 0.05, max_alpha: 0.15, avg_explore: 0.3, diverged_count: 0 },
    [{ selected_provider: 'claude', cnt: 10 }],
    10
  );
  assert.deepEqual(result, [], 'should return empty for <20 decisions');
});

test('routing-anomaly: explore_dominates detection', () => {
  const result = detectAnomalies(
    { avg_score: 0.5, min_score: 0.3, max_score: 0.7, avg_alpha: 0.1, min_alpha: 0.05, max_alpha: 0.15, avg_explore: 0.2, diverged_count: 0 },
    [{ selected_provider: 'claude', cnt: 15 }, { selected_provider: 'gemini', cnt: 10 }],
    25
  );
  const found = result.find(a => a.type === 'explore_dominates');
  assert.ok(found, 'should detect explore_dominates (0.2/0.5 = 0.4 > 0.3)');
  assert.equal(found.severity, 'warn');
});

test('routing-anomaly: alpha_stuck detection', () => {
  const result = detectAnomalies(
    { avg_score: 0.7, min_score: 0.5, max_score: 0.8, avg_alpha: 0.10, min_alpha: 0.099, max_alpha: 0.101, avg_explore: 0.01, diverged_count: 0 },
    [{ selected_provider: 'claude', cnt: 30 }, { selected_provider: 'gemini', cnt: 25 }],
    55
  );
  const found = result.find(a => a.type === 'alpha_stuck');
  assert.ok(found, 'should detect alpha_stuck (range 0.002 < 0.02, total > 50)');
});

test('routing-anomaly: score_drift detection', () => {
  const result = detectAnomalies(
    { avg_score: 0.5, min_score: 0.1, max_score: 0.9, avg_alpha: 0.2, min_alpha: 0.1, max_alpha: 0.3, avg_explore: 0.01, diverged_count: 0 },
    [{ selected_provider: 'claude', cnt: 12 }, { selected_provider: 'gemini', cnt: 13 }],
    25
  );
  const found = result.find(a => a.type === 'score_drift');
  assert.ok(found, 'should detect score_drift (0.9 - 0.1 = 0.8 > 0.5)');
  assert.equal(found.severity, 'critical');
});

test('routing-anomaly: provider_monopoly detection', () => {
  const result = detectAnomalies(
    { avg_score: 0.7, min_score: 0.5, max_score: 0.8, avg_alpha: 0.2, min_alpha: 0.1, max_alpha: 0.3, avg_explore: 0.01, diverged_count: 0 },
    [{ selected_provider: 'claude', cnt: 23 }, { selected_provider: 'gemini', cnt: 2 }],
    25
  );
  const found = result.find(a => a.type === 'provider_monopoly');
  assert.ok(found, 'should detect provider_monopoly (23/25 = 92% > 85%)');
});

test('routing-anomaly: healthy stats → no anomalies', () => {
  const result = detectAnomalies(
    { avg_score: 0.7, min_score: 0.5, max_score: 0.8, avg_alpha: 0.15, min_alpha: 0.10, max_alpha: 0.25, avg_explore: 0.05, diverged_count: 3 },
    [{ selected_provider: 'claude', cnt: 12 }, { selected_provider: 'gemini', cnt: 8 }, { selected_provider: 'codex', cnt: 5 }],
    25
  );
  assert.deepEqual(result, [], 'healthy stats should produce no anomalies');
});
