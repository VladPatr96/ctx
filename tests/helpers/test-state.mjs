/**
 * Cross-run test state tracking.
 *
 * Persists test results in .data/test-results.json so we can detect
 * newly failing tests and pass-after-fail (fixed) tests across runs.
 */

import { join, relative } from 'node:path';
import { readJsonFile, writeJsonAtomic } from '../../src/core/utils/state-io.js';

function getStateFile() {
  const dataDir = process.env.CTX_DATA_DIR || join(process.cwd(), '.data');
  return join(dataDir, 'test-results.json');
}

function defaultState() {
  return { lastRun: null, lastCommit: null, tests: {} };
}

/**
 * Normalize a test file path + name into a stable cross-platform key.
 */
export function testKey(file, name) {
  const cwd = process.env.CLAUDE_PLUGIN_ROOT || process.cwd();
  const rel = relative(cwd, file || '').replace(/\\/g, '/');
  return `${rel}::${name}`;
}

/**
 * Load previous test results from .data/test-results.json.
 */
export function loadPreviousResults() {
  return readJsonFile(getStateFile(), defaultState());
}

/**
 * Save current test results atomically.
 */
export function saveCurrentResults(results) {
  writeJsonAtomic(getStateFile(), results);
}

/**
 * Compare previous and current results to classify each test.
 *
 * @returns {{ newFailures: object[], fixedTests: object[], persistentFailures: object[] }}
 */
export function diffResults(previous, currentFailures, currentPasses) {
  const prevTests = previous.tests || {};
  const newFailures = [];
  const fixedTests = [];
  const persistentFailures = [];

  for (const fail of currentFailures) {
    const key = fail.key;
    if (prevTests[key] && prevTests[key].status === 'fail') {
      persistentFailures.push(fail);
    } else {
      newFailures.push(fail);
    }
  }

  for (const pass of currentPasses) {
    const key = pass.key;
    if (prevTests[key] && prevTests[key].status === 'fail') {
      fixedTests.push({
        ...pass,
        originalError: prevTests[key].error,
        firstFailed: prevTests[key].firstFailed
      });
    }
  }

  return { newFailures, fixedTests, persistentFailures };
}
