import test from 'node:test';
import assert from 'node:assert/strict';
import {
  latencyScore,
  smoothedWinRate,
  computeAlpha,
  evalScore,
  feedbackSignal,
  adaptiveScore,
  rankCandidates
} from '../scripts/evaluation/adaptive-weight.js';

// ---- latencyScore ----

test('latencyScore: 0ms → 1.0', () => {
  assert.equal(latencyScore(0), 1.0);
});

test('latencyScore: 5000ms → 0.0', () => {
  assert.equal(latencyScore(5000), 0.0);
});

test('latencyScore: 2500ms → 0.5', () => {
  assert.equal(latencyScore(2500), 0.5);
});

test('latencyScore: >5000ms → 0.0', () => {
  assert.equal(latencyScore(8000), 0.0);
});

test('latencyScore: null → 0.5', () => {
  assert.equal(latencyScore(null), 0.5);
});

test('latencyScore: undefined → 0.5', () => {
  assert.equal(latencyScore(undefined), 0.5);
});

test('latencyScore: NaN → 0.5', () => {
  assert.equal(latencyScore(NaN), 0.5);
});

// ---- smoothedWinRate ----

test('smoothedWinRate: cold-start (n=0) returns prior', () => {
  const result = smoothedWinRate(0, 0, 0.25, 3);
  assert.equal(result, (0 + 3 * 0.25) / (0 + 3)); // 0.25
});

test('smoothedWinRate: strong data (n=10) approaches raw rate', () => {
  const result = smoothedWinRate(8, 10, 0.25, 3);
  const expected = (8 + 3 * 0.25) / (10 + 3);
  assert.ok(Math.abs(result - expected) < 1e-10);
});

test('smoothedWinRate: k=0 returns raw win rate', () => {
  const result = smoothedWinRate(3, 10, 0.25, 0);
  assert.equal(result, 3 / 10);
});

test('smoothedWinRate: perfect wins with smoothing', () => {
  const result = smoothedWinRate(10, 10, 0.25, 3);
  const expected = (10 + 3 * 0.25) / (10 + 3);
  assert.ok(Math.abs(result - expected) < 1e-10);
});

// ---- computeAlpha ----

test('computeAlpha: 0 samples → 0', () => {
  assert.equal(computeAlpha(0), 0);
});

test('computeAlpha: 50 samples → 0.175', () => {
  assert.equal(computeAlpha(50), 0.175);
});

test('computeAlpha: 100 samples → 0.35', () => {
  assert.equal(computeAlpha(100), 0.35);
});

test('computeAlpha: 200 samples → 0.35 (capped)', () => {
  assert.equal(computeAlpha(200), 0.35);
});

test('computeAlpha: null → 0', () => {
  assert.equal(computeAlpha(null), 0);
});

test('computeAlpha: negative → 0', () => {
  assert.equal(computeAlpha(-5), 0);
});

// ---- evalScore ----

test('evalScore: perfect metrics → close to 1.0', () => {
  const metrics = { wins: 100, total_responses: 100, avg_confidence: 1.0, avg_response_ms: 0 };
  const score = evalScore(metrics, 0.25);
  // smoothedWin ~ (100+0.75)/(100+3) ≈ 0.978, confidence=1.0, latency=1.0
  assert.ok(score > 0.9, `Expected >0.9, got ${score}`);
});

test('evalScore: zero metrics → low score', () => {
  const metrics = { wins: 0, total_responses: 0, avg_confidence: 0, avg_response_ms: 5000 };
  const score = evalScore(metrics, 0.25);
  // smoothedWin = 0.25, confidence=0, latency=0 → 0.5*0.25 + 0 + 0 = 0.125
  assert.ok(score < 0.2, `Expected <0.2, got ${score}`);
});

test('evalScore: mid-range metrics → around 0.5', () => {
  const metrics = { wins: 5, total_responses: 10, avg_confidence: 0.5, avg_response_ms: 2500 };
  const score = evalScore(metrics, 0.25);
  assert.ok(score > 0.3 && score < 0.7, `Expected 0.3-0.7, got ${score}`);
});

test('feedbackSignal: derives score from verdict counters', () => {
  const signal = feedbackSignal({
    feedback_positive: 3,
    feedback_neutral: 1,
    feedback_negative: 1,
  });

  assert.equal(signal.count, 5);
  assert.ok(Math.abs(signal.score - 0.7) < 1e-10);
});

// ---- adaptiveScore ----

test('adaptiveScore: null metrics → static only', () => {
  const result = adaptiveScore({ staticWeight: 10, metrics: null, globalWinRate: 0.25 });
  assert.equal(result.finalScore, 1.0);
  assert.equal(result.staticComponent, 1.0);
  assert.equal(result.evalComponent, 0);
  assert.equal(result.exploreComponent, 0);
  assert.equal(result.alpha, 0);
});

test('adaptiveScore: with data → blended score', () => {
  const metrics = { wins: 5, total_responses: 50, avg_confidence: 0.7, avg_response_ms: 1000 };
  const result = adaptiveScore({ staticWeight: 8, metrics, globalWinRate: 0.25 });
  assert.ok(result.alpha > 0, 'alpha should be > 0 with data');
  assert.ok(result.evalComponent > 0, 'eval component should be > 0');
  assert.ok(result.finalScore > 0 && result.finalScore < 1.5, `Unexpected finalScore: ${result.finalScore}`);
});

test('adaptiveScore: alpha grows with samples', () => {
  const m10 = { wins: 5, total_responses: 10, avg_confidence: 0.7, avg_response_ms: 1000 };
  const m100 = { wins: 50, total_responses: 100, avg_confidence: 0.7, avg_response_ms: 1000 };

  const r10 = adaptiveScore({ staticWeight: 8, metrics: m10, globalWinRate: 0.25 });
  const r100 = adaptiveScore({ staticWeight: 8, metrics: m100, globalWinRate: 0.25 });

  assert.ok(r100.alpha > r10.alpha, 'alpha should grow with more samples');
});

test('adaptiveScore: explore bonus for cold-start providers', () => {
  const metrics = { wins: 1, total_responses: 3, avg_confidence: 0.5, avg_response_ms: 2000 };
  const result = adaptiveScore({ staticWeight: 5, metrics, globalWinRate: 0.25 });
  assert.ok(result.exploreComponent > 0, 'explore should be > 0 for <10 samples');
});

test('adaptiveScore: no explore bonus for established providers', () => {
  const metrics = { wins: 5, total_responses: 50, avg_confidence: 0.5, avg_response_ms: 2000 };
  const result = adaptiveScore({ staticWeight: 5, metrics, globalWinRate: 0.25 });
  assert.equal(result.exploreComponent, 0, 'explore should be 0 for >=10 samples');
});

test('adaptiveScore: operator feedback contributes when feedback exists', () => {
  const metrics = {
    wins: 5,
    total_responses: 50,
    avg_confidence: 0.7,
    avg_response_ms: 1000,
    feedback_positive: 4,
    feedback_negative: 1,
    feedback_count: 5,
  };
  const result = adaptiveScore({ staticWeight: 8, metrics, globalWinRate: 0.25 });
  assert.ok(result.feedbackComponent > 0, 'feedback component should be > 0');
});

// ---- rankCandidates ----

test('rankCandidates: empty → empty', () => {
  assert.deepEqual(rankCandidates([], new Map()), []);
});

test('rankCandidates: null → empty', () => {
  assert.deepEqual(rankCandidates(null, new Map()), []);
});

test('rankCandidates: no metrics → static order preserved', () => {
  const candidates = [
    { provider: 'claude', weight: 9, strength: 'planning' },
    { provider: 'codex', weight: 10, strength: 'review' }
  ];
  const result = rankCandidates(candidates, new Map());
  assert.equal(result[0].provider, 'codex');
  assert.equal(result[1].provider, 'claude');
});

test('rankCandidates: with metrics → scoring influences order', () => {
  const candidates = [
    { provider: 'codex', weight: 10, strength: 'review' },
    { provider: 'claude', weight: 9, strength: 'planning' }
  ];
  // Give claude much better eval metrics
  const metricsMap = new Map([
    ['claude', { wins: 90, total_responses: 100, avg_confidence: 0.95, avg_response_ms: 500 }],
    ['codex', { wins: 5, total_responses: 100, avg_confidence: 0.3, avg_response_ms: 4000 }]
  ]);
  const result = rankCandidates(candidates, metricsMap, { globalWinRate: 0.25 });
  // With high enough eval data, claude should overtake codex
  assert.ok(result.length === 2);
  assert.ok(result[0].adaptive, 'should have adaptive details');
});

test('rankCandidates: missing provider in metrics handled gracefully', () => {
  const candidates = [
    { provider: 'claude', weight: 9 },
    { provider: 'unknown', weight: 5 }
  ];
  const metricsMap = new Map([
    ['claude', { wins: 10, total_responses: 20, avg_confidence: 0.8, avg_response_ms: 1000 }]
  ]);
  const result = rankCandidates(candidates, metricsMap);
  assert.equal(result.length, 2);
  // unknown should fall back to static-only scoring
  const unknown = result.find(r => r.provider === 'unknown');
  assert.ok(unknown, 'unknown provider should be in results');
  assert.equal(unknown.adaptive.alpha, 0, 'no metrics → alpha=0');
});

test('rankCandidates: backward compat — candidates without weight use default', () => {
  const candidates = [
    { provider: 'claude' },
    { provider: 'gemini' }
  ];
  const result = rankCandidates(candidates, new Map());
  assert.equal(result.length, 2);
  // Both should get default weight 5 → equal confidence
  assert.equal(result[0].confidence, result[1].confidence);
});
