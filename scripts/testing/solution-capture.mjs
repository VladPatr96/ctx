/**
 * Git-based solution capture for test fixes.
 *
 * When a previously failing test now passes, this module captures
 * what changed (git diff + commit message) as the "solution".
 */

import { basename } from 'node:path';
import { runCommand } from '../utils/shell.js';

const MAX_DIFF_LENGTH = 2000;

function getCwd() {
  return process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
}

/**
 * Get the current HEAD commit short hash.
 */
export async function getCurrentCommit() {
  const result = await runCommand('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: getCwd(), timeout: 10000
  });
  return result.success ? result.stdout : null;
}

/**
 * Get the most recent commit message.
 */
export async function getLastCommitMessage() {
  const result = await runCommand('git', ['log', '-1', '--format=%s'], {
    cwd: getCwd(), timeout: 10000
  });
  return result.success ? result.stdout : null;
}

// Infer the source file from a test file path.
// tests/foo-bar.test.mjs -> scripts/<star><star>/foo-bar.{js,mjs}
export function inferSourceFile(testFile) {
  const base = basename(testFile)
    .replace(/\.test\.mjs$/, '')
    .replace(/\.test\.js$/, '');
  if (!base) return null;
  // Return glob pattern for the source file
  return `scripts/**/${base}.{js,mjs}`;
}

/**
 * Capture git diff for files related to a test fix.
 * Tries diff between lastCommit..HEAD for the test file and inferred source.
 * Falls back to HEAD~1 diff if lastCommit is unavailable.
 */
export async function captureDiff(testFile, lastCommit) {
  const cwd = getCwd();
  const sourceGlob = inferSourceFile(testFile);

  // Build diff range
  const range = lastCommit ? `${lastCommit}..HEAD` : 'HEAD~1..HEAD';
  const args = ['diff', range, '--'];
  if (testFile) args.push(testFile);

  const result = await runCommand('git', args, { cwd, timeout: 15000 });

  let diff = '';
  if (result.success && result.stdout) {
    diff = result.stdout;
  }

  // Also try source file diff if we can find it
  if (sourceGlob && testFile) {
    const sourceResult = await runCommand('git', [
      'diff', range, '--', `:(glob)${sourceGlob}`
    ], { cwd, timeout: 15000 });
    if (sourceResult.success && sourceResult.stdout) {
      diff = diff ? `${diff}\n\n${sourceResult.stdout}` : sourceResult.stdout;
    }
  }

  // Truncate
  if (diff.length > MAX_DIFF_LENGTH) {
    diff = diff.slice(0, MAX_DIFF_LENGTH) + '\n... (truncated)';
  }

  return diff || null;
}
