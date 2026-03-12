import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildConsiliumObservabilitySnapshot,
  createConsiliumObservabilitySnapshot,
} from '../scripts/contracts/consilium-observability.js';

test('buildConsiliumObservabilitySnapshot normalizes rounds, trust matrix, and synthesis summary', () => {
  const snapshot = buildConsiliumObservabilitySnapshot({
    runId: 'run-12345678',
    topic: 'Choose storage runtime',
    aliasMap: new Map([
      ['claude', 'Participant A'],
      ['gemini', 'Participant B'],
    ]),
    totalDurationMs: 2450,
    structured: true,
    rounds: [
      {
        round: 1,
        responses: [
          { provider: 'claude', alias: 'Participant A', status: 'success', response_ms: 950 },
          { provider: 'gemini', alias: 'Participant B', status: 'error', response_ms: 0, error: 'timeout' },
        ],
      },
      {
        round: 2,
        claims: {
          'Participant A': [{ id: 'A1' }],
          'Participant B': [{ id: 'B1' }, { id: 'B2' }],
        },
        new_claims: {
          'Participant B': [{ id: 'B3' }],
        },
        responses: [
          { provider: 'claude', alias: 'Participant A', status: 'completed', response_ms: 700 },
          { provider: 'gemini', alias: 'Participant B', status: 'completed', response_ms: 800 },
        ],
      },
    ],
    aggregatedTrustScores: {
      'Participant A': { B: 0.81 },
      B: { 'Participant A': 0.67 },
    },
    claimGraph: {
      stats: {
        total: 4,
        consensus_count: 2,
        contested_count: 1,
        unique_count: 1,
        contention_ratio: 0.25,
      },
    },
    synthesis: {
      provider: 'claude',
      status: 'success',
      parsed: {
        confidence: 0.84,
        recommendation: 'Prefer sqlite-first until multi-user mode exists.',
        consensus_points: ['Keep sqlite'],
        disputed_points: [{ claim_id: 'B1' }],
      },
    },
    autoStop: {
      stoppedAfterRound: 2,
      reason: 'No contested claims remaining',
    },
  }, {
    generatedAt: '2026-03-12T07:00:00.000Z',
  });

  assert.equal(snapshot.rounds.length, 2);
  assert.equal(snapshot.rounds[0].successfulResponses, 1);
  assert.equal(snapshot.rounds[0].failedResponses, 1);
  assert.equal(snapshot.rounds[1].claimsExtracted, 3);
  assert.equal(snapshot.rounds[1].newClaims, 1);
  assert.equal(snapshot.trustMatrix[0].scores[0].targetAlias, 'Participant B');
  assert.equal(snapshot.claimGraph?.contestedCount, 1);
  assert.equal(snapshot.synthesis.recommendation, 'Prefer sqlite-first until multi-user mode exists.');
  assert.equal(snapshot.autoStop?.stoppedAfterRound, 2);
});

test('createConsiliumObservabilitySnapshot accepts already-normalized payload', () => {
  const snapshot = createConsiliumObservabilitySnapshot({
    generatedAt: '2026-03-12T07:05:00.000Z',
    runId: null,
    topic: 'consilium',
    totalDurationMs: 0,
    structured: false,
    participants: [],
    rounds: [],
    trustMatrix: [],
    claimGraph: null,
    synthesis: {
      provider: null,
      status: null,
      confidence: null,
      recommendation: null,
      consensusPoints: 0,
      disputedPoints: 0,
    },
    autoStop: null,
  });

  assert.equal(snapshot.topic, 'consilium');
  assert.equal(snapshot.trustMatrix.length, 0);
});
