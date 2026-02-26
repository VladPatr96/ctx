import test from 'node:test';
import assert from 'node:assert/strict';
import {
  discoverModels,
  discoverAllModels,
  validateModel,
  getModelIds,
  _clearCache
} from '../scripts/providers/model-discovery.js';

// ---- discoverModels ----

test('discoverModels: claude returns static models', () => {
  _clearCache();
  const result = discoverModels('claude');
  assert.ok(result.models.length >= 2, 'claude should have at least 2 models');
  assert.ok(result.defaultModel, 'should have a default model');
  const ids = result.models.map(m => m.id);
  assert.ok(ids.includes('claude-opus-4-6'), 'should include opus');
  assert.ok(ids.includes('claude-sonnet-4-6'), 'should include sonnet');
});

test('discoverModels: claude models have tier field', () => {
  const result = discoverModels('claude');
  for (const model of result.models) {
    assert.ok(model.id, 'model should have id');
    assert.ok(model.alias, 'model should have alias');
    assert.ok(['flagship', 'balanced', 'fast', 'standard'].includes(model.tier),
      `model ${model.id} should have valid tier, got: ${model.tier}`);
  }
});

test('discoverModels: gemini returns static models', () => {
  _clearCache();
  const result = discoverModels('gemini');
  assert.ok(result.models.length >= 2, 'gemini should have at least 2 models');
  assert.ok(result.defaultModel, 'should have a default model');
  const ids = result.models.map(m => m.id);
  assert.ok(ids.includes('gemini-3.1-pro-preview'), 'should include 3.1-pro');
});

test('discoverModels: codex reads from config', () => {
  _clearCache();
  const result = discoverModels('codex');
  assert.ok(result.models.length >= 1, 'codex should have at least 1 model');
  assert.ok(result.defaultModel, 'should have a default model');
});

test('discoverModels: opencode reads from config', () => {
  _clearCache();
  const result = discoverModels('opencode');
  assert.ok(result.models.length >= 1, 'opencode should have at least 1 model');
  assert.ok(result.defaultModel, 'should have a default model');
});

test('discoverModels: unknown provider returns empty', () => {
  const result = discoverModels('nonexistent');
  assert.deepEqual(result.models, []);
  assert.equal(result.defaultModel, null);
});

// ---- discoverAllModels ----

test('discoverAllModels: returns all 4 providers', () => {
  _clearCache();
  const all = discoverAllModels();
  assert.ok(all.claude, 'should have claude');
  assert.ok(all.gemini, 'should have gemini');
  assert.ok(all.codex, 'should have codex');
  assert.ok(all.opencode, 'should have opencode');
});

// ---- validateModel ----

test('validateModel: exact id match', () => {
  const result = validateModel('claude', 'claude-opus-4-6');
  assert.equal(result.valid, true);
  assert.equal(result.resolved, 'claude-opus-4-6');
});

test('validateModel: alias match', () => {
  const result = validateModel('claude', 'opus-4.6');
  assert.equal(result.valid, true);
  assert.equal(result.resolved, 'claude-opus-4-6');
});

test('validateModel: case insensitive', () => {
  const result = validateModel('claude', 'Claude-Opus-4-6');
  assert.equal(result.valid, true);
});

test('validateModel: partial match → suggestion', () => {
  const result = validateModel('claude', 'opus');
  assert.equal(result.valid, false);
  assert.ok(result.suggestion, 'should suggest a model');
  assert.ok(result.suggestion.includes('opus'), 'suggestion should contain opus');
});

test('validateModel: no match → no suggestion', () => {
  const result = validateModel('claude', 'completely-unknown-model');
  assert.equal(result.valid, false);
  assert.equal(result.resolved, null);
});

test('validateModel: gemini model', () => {
  const result = validateModel('gemini', 'gemini-3.1-pro-preview');
  assert.equal(result.valid, true);
});

// ---- getModelIds ----

test('getModelIds: returns string array', () => {
  const ids = getModelIds('claude');
  assert.ok(Array.isArray(ids));
  assert.ok(ids.length > 0);
  for (const id of ids) {
    assert.equal(typeof id, 'string');
  }
});

test('getModelIds: unknown provider → empty array', () => {
  const ids = getModelIds('nonexistent');
  assert.deepEqual(ids, []);
});

// ---- Cache ----

test('cache: second call returns same result (cached)', () => {
  _clearCache();
  const r1 = discoverModels('claude');
  const r2 = discoverModels('claude');
  assert.deepEqual(r1, r2);
  // Verify it's the same object (from cache)
  assert.equal(r1, r2);
});
