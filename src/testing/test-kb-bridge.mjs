/**
 * Bridge between test results and the Knowledge Base.
 *
 * Saves test failures as KB 'error' entries and test fixes as 'solution' entries.
 * Searches KB for past failures/solutions to suggest fixes.
 */

import { basename } from 'node:path';
import { createKnowledgeStore } from '../knowledge/kb-json-fallback.js';

let store = null;
let projectName = null;

/**
 * Initialize the KB connection. Returns the store or null if unavailable.
 */
export async function initKB() {
  if (store) return store;
  try {
    const result = await createKnowledgeStore();
    store = result.store;
    projectName = basename(process.env.CLAUDE_PLUGIN_ROOT || process.cwd());
    return store;
  } catch {
    return null;
  }
}

/**
 * Search KB for past failures and solutions matching this error.
 */
export async function searchKBForError(errorMsg) {
  if (!store) return [];
  try {
    // Extract meaningful search terms (skip generic assertion text)
    const query = errorMsg
      .replace(/^(AssertionError|Error|TypeError|ReferenceError):\s*/i, '')
      .slice(0, 200);
    if (!query.trim()) return [];

    const errors = store.searchEntries(query, {
      limit: 3,
      category: 'error'
    });
    const solutions = store.searchEntries(query, {
      limit: 3,
      category: 'solution'
    });

    // Filter to auto-test entries first, then include all
    const autoTestResults = [...errors, ...solutions]
      .filter(e => (e.tags || '').includes('auto-test'));

    return autoTestResults.length > 0
      ? autoTestResults
      : [...errors, ...solutions].slice(0, 3);
  } catch {
    return [];
  }
}

/**
 * Save a test failure to KB.
 */
export async function saveTestFailure({ testName, file, error, stack }) {
  if (!store) return null;
  try {
    const fileBasename = file ? basename(file, '.test.mjs') : 'unknown';
    const body = [
      '## Error',
      error || 'Unknown error',
      '',
      '## Stack',
      '```',
      (stack || '').slice(0, 1000),
      '```',
      '',
      '## File',
      file || 'unknown',
      '',
      '## Reproduction',
      `\`node --test ${file || ''}\``
    ].join('\n');

    return store.saveEntry({
      project: projectName,
      category: 'error',
      title: `test-fail: ${testName}`,
      body,
      tags: `auto-test,${fileBasename}`,
      source: 'test-reporter'
    });
  } catch {
    return null;
  }
}

/**
 * Save a solution when a previously failing test now passes.
 */
export async function saveTestFix({ testName, file, originalError, diff, commitMsg }) {
  if (!store) return null;
  try {
    const fileBasename = file ? basename(file, '.test.mjs') : 'unknown';
    const body = [
      '## Original Error',
      originalError || 'Unknown error',
      '',
      diff ? '## Fix' : '',
      diff ? '```diff' : '',
      diff || '',
      diff ? '```' : '',
      '',
      commitMsg ? '## Commit' : '',
      commitMsg || ''
    ].filter(line => line !== '').join('\n');

    return store.saveEntry({
      project: projectName,
      category: 'solution',
      title: `test-fix: ${testName}`,
      body,
      tags: `auto-test,fix,${fileBasename}`,
      source: 'test-reporter'
    });
  } catch {
    return null;
  }
}

/**
 * Close the KB store.
 */
export function closeKB() {
  if (store && typeof store.close === 'function') {
    store.close();
  }
  store = null;
}
