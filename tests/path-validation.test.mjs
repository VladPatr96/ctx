import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isValidAgentName, resolveGeneratedAgentPath } from '../scripts/tools/agents.js';
import { resolveAgentDetailsPath } from '../scripts/dashboard-backend.js';

test('agent name validation accepts kebab-case and rejects traversal patterns', () => {
  assert.equal(isValidAgentName('security-reviewer'), true);
  assert.equal(isValidAgentName('../evil'), false);
  assert.equal(isValidAgentName('name with spaces'), false);
});

test('resolveGeneratedAgentPath blocks traversal names', () => {
  assert.throws(() => resolveGeneratedAgentPath('../evil'), /Invalid agent name/);
});

test('resolveAgentDetailsPath keeps files inside agents directory', () => {
  const agentsDir = mkdtempSync(join(tmpdir(), 'ctx-agents-'));
  const safe = resolveAgentDetailsPath('architect', agentsDir);
  assert.equal(safe, resolve(agentsDir, 'architect.md'));
  assert.throws(() => resolveAgentDetailsPath('../../secret', agentsDir), /Invalid agent ID/);
});
