import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildProviderResilienceStatus,
  buildStorageResilienceStatus,
} from '../scripts/contracts/resilience-schemas.js';

test('buildStorageResilienceStatus marks rollback and warning states as degraded', () => {
  const degraded = buildStorageResilienceStatus({
    mode: 'sqlite-primary',
    effectiveMode: 'json-backup',
    failover: true,
    warningActive: true,
    policyState: 'forced_json',
    failureRatio: 0.42,
  }, {
    sourceCount: 2,
  });

  assert.equal(degraded.status, 'degraded');
  assert.equal(degraded.effectiveMode, 'json-backup');
  assert.equal(degraded.failureRatio, 0.42);
  assert.ok(degraded.reasons.includes('primary_storage_unavailable'));
});

test('buildStorageResilienceStatus marks unknown storage surface without sources as offline', () => {
  const offline = buildStorageResilienceStatus({
    mode: 'unknown',
  }, {
    sourceCount: 0,
  });

  assert.equal(offline.status, 'offline');
  assert.ok(offline.reasons.includes('storage_surface_unavailable'));
});

test('buildProviderResilienceStatus marks circuit-open providers as offline', () => {
  const offline = buildProviderResilienceStatus('claude', {
    model: 'opus-4.6',
    hasTelemetry: true,
    failures: 3,
    successRate: 50,
  });

  assert.equal(offline.status, 'offline');
  assert.equal(offline.circuitOpen, true);
  assert.equal(offline.consecutiveFailures, 3);
  assert.ok(offline.reasons.includes('provider_circuit_open'));
});

test('buildProviderResilienceStatus distinguishes degraded from unconfigured providers', () => {
  const degraded = buildProviderResilienceStatus('gemini', {
    model: 'gemini-2.5-pro',
    hasTelemetry: true,
    failures: 1,
    successRate: 75,
  });
  const unconfigured = buildProviderResilienceStatus('codex', {
    model: null,
    hasTelemetry: false,
    failures: 0,
  });

  assert.equal(degraded.status, 'degraded');
  assert.ok(degraded.reasons.includes('recent_provider_failures'));
  assert.equal(unconfigured.status, 'offline');
  assert.ok(unconfigured.reasons.includes('provider_unconfigured'));
});
