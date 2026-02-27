import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readJsonFile } from '../scripts/utils/state-io.js';

// ==================== test-state tests ====================

test('testKey — normalizes Windows paths and builds stable key', async () => {
  const origRoot = process.env.CLAUDE_PLUGIN_ROOT;
  process.env.CLAUDE_PLUGIN_ROOT = 'D:/projects/myapp';
  try {
    const { testKey } = await import(`../scripts/testing/test-state.mjs?v=${Date.now()}a`);
    const key = testKey('D:\\projects\\myapp\\tests\\foo.test.mjs', 'my test');
    assert.equal(key, 'tests/foo.test.mjs::my test');
  } finally {
    if (origRoot === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
    else process.env.CLAUDE_PLUGIN_ROOT = origRoot;
  }
});

test('testKey — handles relative paths', async () => {
  const origRoot = process.env.CLAUDE_PLUGIN_ROOT;
  const cwd = process.cwd();
  process.env.CLAUDE_PLUGIN_ROOT = cwd;
  try {
    const { testKey } = await import(`../scripts/testing/test-state.mjs?v=${Date.now()}b`);
    const key = testKey(join(cwd, 'tests', 'bar.test.mjs'), 'another test');
    assert.equal(key, 'tests/bar.test.mjs::another test');
  } finally {
    if (origRoot === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
    else process.env.CLAUDE_PLUGIN_ROOT = origRoot;
  }
});

test('diffResults — classifies newFailures correctly', async () => {
  const { diffResults } = await import(`../scripts/testing/test-state.mjs?v=${Date.now()}c`);
  const previous = { lastRun: null, lastCommit: null, tests: {} };
  const failures = [{ key: 'a::test1', name: 'test1', file: 'a', error: 'err' }];
  const passes = [];

  const result = diffResults(previous, failures, passes);
  assert.equal(result.newFailures.length, 1);
  assert.equal(result.fixedTests.length, 0);
  assert.equal(result.persistentFailures.length, 0);
});

test('diffResults — classifies fixedTests correctly', async () => {
  const { diffResults } = await import(`../scripts/testing/test-state.mjs?v=${Date.now()}d`);
  const previous = {
    lastRun: '2026-01-01', lastCommit: 'abc',
    tests: {
      'a::test1': { status: 'fail', error: 'old error', firstFailed: '2026-01-01' }
    }
  };
  const failures = [];
  const passes = [{ key: 'a::test1', name: 'test1', file: 'a' }];

  const result = diffResults(previous, failures, passes);
  assert.equal(result.newFailures.length, 0);
  assert.equal(result.fixedTests.length, 1);
  assert.equal(result.fixedTests[0].originalError, 'old error');
  assert.equal(result.persistentFailures.length, 0);
});

test('diffResults — classifies persistentFailures correctly', async () => {
  const { diffResults } = await import(`../scripts/testing/test-state.mjs?v=${Date.now()}e`);
  const previous = {
    lastRun: '2026-01-01', lastCommit: 'abc',
    tests: {
      'a::test1': { status: 'fail', error: 'same error', firstFailed: '2026-01-01' }
    }
  };
  const failures = [{ key: 'a::test1', name: 'test1', file: 'a', error: 'same error' }];
  const passes = [];

  const result = diffResults(previous, failures, passes);
  assert.equal(result.newFailures.length, 0);
  assert.equal(result.fixedTests.length, 0);
  assert.equal(result.persistentFailures.length, 1);
});

// ==================== solution-capture tests ====================

test('inferSourceFile — maps test file to source glob', async () => {
  const { inferSourceFile } = await import(`../scripts/testing/solution-capture.mjs?v=${Date.now()}f`);
  assert.equal(inferSourceFile('tests/knowledge-store.test.mjs'), 'scripts/**/knowledge-store.{js,mjs}');
  assert.equal(inferSourceFile('tests/shell-utils.test.mjs'), 'scripts/**/shell-utils.{js,mjs}');
  assert.equal(inferSourceFile('tests/worktree-manager.test.mjs'), 'scripts/**/worktree-manager.{js,mjs}');
});

test('inferSourceFile — returns null for empty basename', async () => {
  const { inferSourceFile } = await import(`../scripts/testing/solution-capture.mjs?v=${Date.now()}g`);
  assert.equal(inferSourceFile('.test.mjs'), null);
});

// ==================== test-kb-bridge tests ====================

test('saveTestFailure — creates correctly formatted KB entry', async () => {
  // We test the formatting by mocking the store
  const mockEntries = [];
  const mockStore = {
    saveEntry(entry) {
      mockEntries.push(entry);
      return { saved: true, hash: 'abc' };
    },
    searchEntries() { return []; },
    close() {}
  };

  // Monkey-patch createKnowledgeStore for this test
  const bridge = await import(`../scripts/testing/test-kb-bridge.mjs?v=${Date.now()}h`);

  // We can't easily inject the mock, so test the entry format expectations
  // by checking the module's behavior with a real (temporary) KB
  const tmpDir = mkdtempSync(join(tmpdir(), 'kb-test-'));
  const origKbPath = process.env.CTX_KB_PATH;
  process.env.CTX_KB_PATH = join(tmpDir, 'knowledge.json');
  try {
    // Re-init with temp path
    const freshBridge = await import(`../scripts/testing/test-kb-bridge.mjs?v=${Date.now()}i`);
    const kb = await freshBridge.initKB();
    if (!kb) {
      // KB unavailable — skip gracefully
      return;
    }

    const result = await freshBridge.saveTestFailure({
      testName: 'my test',
      file: 'tests/foo.test.mjs',
      error: 'Expected 1 to equal 2',
      stack: 'at Test (foo.test.mjs:10)'
    });
    assert.ok(result, 'Should return save result');
    assert.ok(result.saved, 'Should be saved');

    // Search for it
    const found = await freshBridge.searchKBForError('Expected 1 to equal 2');
    assert.ok(found.length > 0, 'Should find saved failure');
    assert.ok(found[0].title.includes('test-fail:'), 'Title should have test-fail prefix');

    freshBridge.closeKB();
  } finally {
    if (origKbPath === undefined) delete process.env.CTX_KB_PATH;
    else process.env.CTX_KB_PATH = origKbPath;
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

test('saveTestFix — creates correctly formatted solution entry', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'kb-fix-'));
  const origKbPath = process.env.CTX_KB_PATH;
  process.env.CTX_KB_PATH = join(tmpDir, 'knowledge.json');
  try {
    const bridge = await import(`../scripts/testing/test-kb-bridge.mjs?v=${Date.now()}j`);
    const kb = await bridge.initKB();
    if (!kb) return;

    const result = await bridge.saveTestFix({
      testName: 'my fixed test',
      file: 'tests/bar.test.mjs',
      originalError: 'TypeError: undefined',
      diff: '+ const x = 1;',
      commitMsg: 'fix: handle undefined case'
    });
    assert.ok(result, 'Should return save result');
    assert.ok(result.saved, 'Should be saved');

    const found = kb.searchEntries('my fixed test', { category: 'solution', limit: 5 });
    assert.ok(found.length > 0, 'Should find saved solution');
    assert.ok(found[0].title.includes('test-fix:'), 'Title should have test-fix prefix');
    assert.ok(found[0].body.includes('TypeError: undefined'), 'Body should contain original error');
    assert.ok(found[0].tags.includes('fix'), 'Tags should include fix');

    bridge.closeKB();
  } finally {
    if (origKbPath === undefined) delete process.env.CTX_KB_PATH;
    else process.env.CTX_KB_PATH = origKbPath;
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

// ==================== Integration: test state persistence ====================

test('integration — state file persists failures across calls', async () => {
  const tmpDir = mkdtempSync(join(tmpdir(), 'state-int-'));
  const dataDir = join(tmpDir, '.data');

  const origData = process.env.CTX_DATA_DIR;
  const origRoot = process.env.CLAUDE_PLUGIN_ROOT;
  process.env.CTX_DATA_DIR = dataDir;
  process.env.CLAUDE_PLUGIN_ROOT = tmpDir;

  try {
    const { loadPreviousResults, saveCurrentResults, diffResults, testKey }
      = await import(`../scripts/testing/test-state.mjs?v=${Date.now()}int`);

    // Simulate first run with a failure
    const key = testKey(join(tmpDir, 'tests', 'foo.test.mjs'), 'broken test');
    const failures = [{ key, name: 'broken test', file: 'tests/foo.test.mjs', error: 'Expected 1 to equal 2' }];
    const passes = [];

    const prev = loadPreviousResults();
    const diff1 = diffResults(prev, failures, passes);
    assert.equal(diff1.newFailures.length, 1, 'Should detect new failure');

    // Save state
    const now = new Date().toISOString();
    saveCurrentResults({
      lastRun: now,
      lastCommit: 'abc123',
      tests: { [key]: { status: 'fail', error: 'Expected 1 to equal 2', file: 'tests/foo.test.mjs', firstFailed: now, lastSeen: now } }
    });

    // Verify file exists
    const stateFile = join(dataDir, 'test-results.json');
    assert.ok(existsSync(stateFile), 'test-results.json should exist');

    // Simulate second run where test now passes
    const prev2 = loadPreviousResults();
    assert.equal(prev2.lastCommit, 'abc123');
    const diff2 = diffResults(prev2, [], [{ key, name: 'broken test', file: 'tests/foo.test.mjs' }]);
    assert.equal(diff2.fixedTests.length, 1, 'Should detect fixed test');
    assert.equal(diff2.fixedTests[0].originalError, 'Expected 1 to equal 2');
  } finally {
    if (origData === undefined) delete process.env.CTX_DATA_DIR;
    else process.env.CTX_DATA_DIR = origData;
    if (origRoot === undefined) delete process.env.CLAUDE_PLUGIN_ROOT;
    else process.env.CLAUDE_PLUGIN_ROOT = origRoot;
    rmSync(tmpDir, { recursive: true, force: true });
  }
});
