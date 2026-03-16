import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { isValidAgentName, resolveGeneratedAgentPath } from '../src/tools/agents.js';
import { resolveAgentDetailsPath } from '../src/dashboard/server.js';

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

test('resolveAgentDetailsPath blocks complex traversal patterns', () => {
  const agentsDir = mkdtempSync(join(tmpdir(), 'ctx-agents-'));
  
  // Various traversal attempts
  assert.throws(() => resolveAgentDetailsPath('../../../etc/passwd', agentsDir), /Invalid agent ID/);
  assert.throws(() => resolveAgentDetailsPath('foo/../../bar', agentsDir), /Invalid agent ID/);
  assert.throws(() => resolveAgentDetailsPath('..', agentsDir), /Invalid agent ID/);
  assert.throws(() => resolveAgentDetailsPath('.', agentsDir), /Invalid agent ID/);
  
  // Valid names should work
  assert.doesNotThrow(() => resolveAgentDetailsPath('my-agent', agentsDir));
  assert.doesNotThrow(() => resolveAgentDetailsPath('agent123', agentsDir));
  assert.doesNotThrow(() => resolveAgentDetailsPath('test_agent', agentsDir));
});

test('resolveAgentDetailsPath handles edge cases', () => {
  const agentsDir = mkdtempSync(join(tmpdir(), 'ctx-agents-'));
  
  // Very long valid name (64 chars max)
  const longName = 'a'.repeat(64);
  assert.doesNotThrow(() => resolveAgentDetailsPath(longName, agentsDir));
  
  // Too long name (65 chars)
  const tooLongName = 'a'.repeat(65);
  assert.throws(() => resolveAgentDetailsPath(tooLongName, agentsDir), /Invalid agent ID/);
  
  // Empty name
  assert.throws(() => resolveAgentDetailsPath('', agentsDir), /Invalid agent ID/);
  
  // Null/undefined
  assert.throws(() => resolveAgentDetailsPath(null, agentsDir), /Invalid agent ID/);
  assert.throws(() => resolveAgentDetailsPath(undefined, agentsDir), /Invalid agent ID/);
});
