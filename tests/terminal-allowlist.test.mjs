import test from 'node:test';
import assert from 'node:assert/strict';
import { listAllowlistedCommands, parseAllowlistedCommand } from '../ctx-app/electron/terminal-allowlist.js';

test('terminal allowlist exposes expected commands', () => {
  const commands = listAllowlistedCommands();
  assert.ok(commands.includes('node -v'));
  assert.ok(commands.includes('npm test'));
  assert.ok(commands.includes('git status --short'));
});

test('parseAllowlistedCommand accepts allowlisted command', () => {
  const parsed = parseAllowlistedCommand('node -v', 'linux');
  assert.equal(parsed.bin, 'node');
  assert.deepEqual(parsed.args, ['-v']);
  assert.equal(parsed.normalized, 'node -v');
});

test('parseAllowlistedCommand normalizes npm.cmd for windows', () => {
  const parsed = parseAllowlistedCommand('npm.cmd test', 'win32');
  assert.equal(parsed.bin, 'npm.cmd');
  assert.deepEqual(parsed.args, ['test']);
});

test('parseAllowlistedCommand rejects forbidden shell characters', () => {
  assert.throws(
    () => parseAllowlistedCommand('node -v && whoami', 'linux'),
    /forbidden characters/
  );
});

test('parseAllowlistedCommand rejects non-allowlisted args', () => {
  assert.throws(
    () => parseAllowlistedCommand('git log', 'linux'),
    /not allowlisted/
  );
});
