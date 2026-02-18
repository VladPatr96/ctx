import test from 'node:test';
import assert from 'node:assert/strict';
import { runCommand } from '../scripts/utils/shell.js';

test('runCommand keeps special characters in arguments literal', async () => {
  const payload = 'a";&|^%$()[]{}';
  const result = await runCommand(
    process.execPath,
    ['-e', 'console.log(process.argv[1])', payload],
    { timeout: 5000 }
  );

  assert.equal(result.success, true);
  assert.equal(result.stdout, payload);
});
