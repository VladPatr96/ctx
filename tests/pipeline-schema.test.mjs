import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDataPatch } from '../src/tools/pipeline.js';
import { TASK_FULL_SCHEMA } from '../src/dashboard/actions.js';

test('parseDataPatch accepts allowed fields', () => {
  const patch = parseDataPatch({
    lead: 'claude',
    activePreset: 'full',
    activeAgents: ['architect'],
    activeSkills: ['ctx'],
    models: { claude: 'claude-opus-4-6' }
  });

  assert.equal(patch.lead, 'claude');
  assert.equal(patch.activePreset, 'full');
});

test('parseDataPatch rejects unknown fields', () => {
  assert.throws(() => parseDataPatch({ dangerous: true }), /Invalid pipeline data/);
});

test('TASK_FULL_SCHEMA rejects invalid agent names', () => {
  const result = TASK_FULL_SCHEMA.safeParse({
    task: 'Phase2',
    agents: ['../evil']
  });
  assert.equal(result.success, false);
});
