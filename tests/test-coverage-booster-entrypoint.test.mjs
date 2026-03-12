import test from 'node:test';
import assert from 'node:assert/strict';
import skillModule from '../skills/test-coverage-booster/index.js';

test('test-coverage booster exposes explicit command entrypoint', () => {
  assert.equal(typeof skillModule['test-coverage'], 'function');
});
