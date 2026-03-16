/**
 * kb-reporter.mjs — Custom node:test reporter with Knowledge Base integration.
 *
 * Captures test failures → saves to KB.
 * Detects pass-after-fail → captures solution (git diff) to KB.
 * Searches KB for past solutions when a test fails.
 *
 * Usage:
 *   node --test \
 *     --test-reporter=spec --test-reporter=./scripts/testing/kb-reporter.mjs \
 *     --test-reporter-destination=stdout --test-reporter-destination=stderr
 */

import { testKey, loadPreviousResults, saveCurrentResults, diffResults } from './test-state.mjs';
import { initKB, searchKBForError, saveTestFailure, saveTestFix, closeKB } from './test-kb-bridge.mjs';
import { getCurrentCommit, getLastCommitMessage, captureDiff } from './solution-capture.mjs';

/**
 * Format KB search results for stderr output.
 */
function formatSuggestions(testName, entries) {
  if (!entries.length) return '';
  const lines = [`[kb] FAIL: ${testName}`, '     Past solutions found:'];
  for (const e of entries.slice(0, 3)) {
    const date = (e.created_at || '').slice(0, 10);
    lines.push(`     → ${e.title} (${date})`);
    // Show first meaningful line of body
    const firstLine = (e.body || '')
      .split('\n')
      .find(l => l.trim() && !l.startsWith('#') && !l.startsWith('```'));
    if (firstLine) {
      lines.push(`       ${firstLine.trim().slice(0, 100)}`);
    }
  }
  return lines.join('\n');
}

/**
 * Build test name from event data, handling nesting.
 */
function buildTestName(data) {
  // node:test provides nesting level; use data.name directly
  return data.name || 'unnamed test';
}

/**
 * Extract error message and stack from test failure details.
 */
function extractError(data) {
  const details = data.details || {};
  const error = details.error || {};
  const message = error.message || error.cause?.message || String(error) || 'Unknown error';
  const stack = error.stack || error.cause?.stack || '';
  return { message, stack };
}

/**
 * Process end-of-run: save new failures, capture fixes, update state.
 */
async function* processRunResults(failures, passes) {
  const previous = loadPreviousResults();
  const { newFailures, fixedTests, persistentFailures } = diffResults(previous, failures, passes);

  const kb = await initKB();
  let savedCount = 0;
  let fixedCount = 0;

  // Save new failures to KB
  for (const fail of newFailures) {
    if (kb) {
      const result = await saveTestFailure({
        testName: fail.name,
        file: fail.file,
        error: fail.error,
        stack: fail.stack
      });
      if (result && result.saved) savedCount++;
    }
  }

  // Capture solutions for fixed tests
  if (fixedTests.length > 0) {
    const commitMsg = await getLastCommitMessage();
    const lastCommit = previous.lastCommit;

    for (const fix of fixedTests) {
      if (kb) {
        const diff = await captureDiff(fix.file, lastCommit);
        const result = await saveTestFix({
          testName: fix.name,
          file: fix.file,
          originalError: fix.originalError,
          diff,
          commitMsg
        });
        if (result && result.saved) fixedCount++;
      }
    }
  }

  // Update state file
  const currentCommit = await getCurrentCommit();
  const now = new Date().toISOString();
  const newState = {
    lastRun: now,
    lastCommit: currentCommit,
    tests: {}
  };

  for (const fail of failures) {
    const prev = previous.tests[fail.key];
    newState.tests[fail.key] = {
      status: 'fail',
      error: fail.error,
      file: fail.file,
      firstFailed: (prev && prev.firstFailed) || now,
      lastSeen: now
    };
  }

  saveCurrentResults(newState);
  closeKB();

  // Summary output
  const lines = ['', '--- KB Summary ---'];
  if (savedCount > 0) lines.push(`  New failures: ${savedCount} (saved to KB)`);
  if (fixedCount > 0) lines.push(`  Fixed tests:  ${fixedCount} (solutions captured)`);
  if (persistentFailures.length > 0) lines.push(`  Known issues: ${persistentFailures.length}`);
  if (savedCount === 0 && fixedCount === 0 && persistentFailures.length === 0) {
    lines.push('  All tests passing, no KB updates needed.');
  }
  lines.push('---', '');

  yield lines.join('\n');
}

/**
 * Custom node:test reporter — async generator.
 */
export default async function* kbReporter(source) {
  const failures = [];
  const passes = [];
  let kbInitialized = false;

  yield '\n--- KB Test Reporter ---\n';

  try {
    for await (const event of source) {
      // Only track top-level tests (nesting === 0 or undefined)
      const nesting = event.data?.nesting ?? 0;
      if (nesting > 0) continue;

      if (event.type === 'test:fail') {
        const data = event.data;
        const name = buildTestName(data);
        const { message, stack } = extractError(data);
        const file = data.file || null;
        const key = testKey(file, name);

        failures.push({ key, name, file, error: message, stack });

        // Lazy init KB on first failure
        if (!kbInitialized) {
          await initKB();
          kbInitialized = true;
        }

        // Immediate KB search for suggestions
        try {
          const suggestions = await searchKBForError(message);
          const formatted = formatSuggestions(name, suggestions);
          if (formatted) yield formatted + '\n';
        } catch {
          // Don't break test run
        }
      }

      if (event.type === 'test:pass') {
        const data = event.data;
        const name = buildTestName(data);
        const file = data.file || null;
        const key = testKey(file, name);
        passes.push({ key, name, file });
      }
    }
  } catch (err) {
    yield `[kb] Reporter error: ${err.message}\n`;
  }

  // End-of-run processing
  try {
    if (!kbInitialized) await initKB();
    yield* processRunResults(failures, passes);
  } catch (err) {
    yield `[kb] Summary error: ${err.message}\n`;
  }
}
