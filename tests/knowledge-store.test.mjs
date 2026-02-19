import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Try SQLite store first, fall back to JSON
let StoreClass;
let storeMode;
try {
  const mod = await import('../scripts/knowledge/knowledge-store.js');
  StoreClass = mod.KnowledgeStore;
  storeMode = 'sqlite';
} catch {
  const mod = await import('../scripts/knowledge/kb-json-fallback.js');
  StoreClass = mod.JsonKnowledgeStore;
  storeMode = 'json';
}

function createTempStore() {
  const dir = mkdtempSync(join(tmpdir(), 'ctx-kb-'));
  const opts = storeMode === 'sqlite'
    ? { dbDir: dir, dbPath: join(dir, 'test.sqlite') }
    : { dbDir: dir, filePath: join(dir, 'test.json') };
  return { store: new StoreClass(opts), dir };
}

test(`KnowledgeStore (${storeMode}): saveEntry + dedup`, () => {
  const { store, dir } = createTempStore();
  try {
    const r1 = store.saveEntry({
      project: 'test-proj',
      category: 'solution',
      title: 'Fix SQLite WAL',
      body: 'Set PRAGMA journal_mode = WAL before any queries.'
    });
    assert.equal(r1.saved, true);
    assert.ok(r1.hash);

    // Duplicate — same content
    const r2 = store.saveEntry({
      project: 'test-proj',
      category: 'solution',
      title: 'Fix SQLite WAL',
      body: 'Set PRAGMA journal_mode = WAL before any queries.'
    });
    assert.equal(r2.saved, false);
    assert.equal(r2.reason, 'duplicate');
    assert.equal(r2.hash, r1.hash);

    // Different entry
    const r3 = store.saveEntry({
      project: 'test-proj',
      category: 'error',
      title: 'FTS5 crash',
      body: 'FTS5 requires porter tokenizer config.'
    });
    assert.equal(r3.saved, true);
    assert.notEqual(r3.hash, r1.hash);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test(`KnowledgeStore (${storeMode}): searchEntries`, () => {
  const { store, dir } = createTempStore();
  try {
    store.saveEntry({
      project: 'proj-a',
      category: 'solution',
      title: 'SQLite WAL mode fix',
      body: 'Always enable WAL mode for concurrent reads.'
    });
    store.saveEntry({
      project: 'proj-b',
      category: 'error',
      title: 'Node.js import error',
      body: 'Use createRequire for CJS modules in ESM context.'
    });
    store.saveEntry({
      project: 'proj-a',
      category: 'decision',
      title: 'Use FTS5 for search',
      body: 'FTS5 with porter tokenizer gives best results for English text.'
    });

    const results = store.searchEntries('SQLite WAL');
    assert.ok(results.length >= 1);
    assert.ok(results.some(r => r.title.includes('WAL')));

    // Filter by project
    const projA = store.searchEntries('FTS5', { project: 'proj-a' });
    assert.ok(projA.length >= 1);
    assert.ok(projA.every(r => r.project === 'proj-a'));
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test(`KnowledgeStore (${storeMode}): getContextForProject`, () => {
  const { store, dir } = createTempStore();
  try {
    store.saveEntry({
      project: 'my-proj',
      category: 'solution',
      title: 'Solution 1',
      body: 'Body 1'
    });
    store.saveEntry({
      project: 'my-proj',
      category: 'decision',
      title: 'Decision 1',
      body: 'Body 2'
    });
    store.saveEntry({
      project: 'other-proj',
      category: 'error',
      title: 'Error in other',
      body: 'Body 3'
    });

    const ctx = store.getContextForProject('my-proj', 10);
    assert.equal(ctx.entries.length, 2);
    assert.ok(ctx.entries.every(e => e.project === 'my-proj'));
    assert.equal(ctx.snapshot, null);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test(`KnowledgeStore (${storeMode}): saveSnapshot / getSnapshot`, () => {
  const { store, dir } = createTempStore();
  try {
    store.saveSnapshot('proj-x', { branch: 'main', tasks: ['a', 'b'] });
    const snap = store.getSnapshot('proj-x');
    assert.ok(snap);
    assert.equal(snap.data.branch, 'main');
    assert.deepEqual(snap.data.tasks, ['a', 'b']);
    assert.ok(snap.created_at);

    // Non-existent project
    const none = store.getSnapshot('no-such-project');
    assert.equal(none, null);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test(`KnowledgeStore (${storeMode}): getStats`, () => {
  const { store, dir } = createTempStore();
  try {
    store.saveEntry({ project: 'p1', category: 'solution', title: 'T1', body: 'B1' });
    store.saveEntry({ project: 'p1', category: 'error', title: 'T2', body: 'B2' });
    store.saveEntry({ project: 'p2', category: 'solution', title: 'T3', body: 'B3' });

    const stats = store.getStats();
    assert.equal(stats.total, 3);
    assert.equal(stats.byCategory.solution, 2);
    assert.equal(stats.byCategory.error, 1);
    assert.equal(stats.byProject.p1, 2);
    assert.equal(stats.byProject.p2, 1);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test(`KnowledgeStore (${storeMode}): importFromIssues`, () => {
  const { store, dir } = createTempStore();
  try {
    const issues = [
      {
        title: 'Lesson: sqlite error',
        body: 'Fix: use WAL mode',
        labels: ['lesson', 'project:test'],
        repository: { name: 'test-repo' }
      },
      {
        title: 'Session: 2026-02-19',
        body: 'Worked on KB',
        labels: ['session'],
        repository: { name: 'test-repo' }
      }
    ];

    const result = store.importFromIssues(issues);
    assert.equal(result.imported, 2);
    assert.equal(result.skipped, 0);

    // Import again — duplicates
    const result2 = store.importFromIssues(issues);
    assert.equal(result2.imported, 0);
    assert.equal(result2.skipped, 2);
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test(`KnowledgeStore (${storeMode}): meta get/set`, () => {
  const { store, dir } = createTempStore();
  try {
    assert.equal(store.getMeta('test_key'), null);
    store.setMeta('test_key', 'hello');
    assert.equal(store.getMeta('test_key'), 'hello');
    store.setMeta('test_key', 'updated');
    assert.equal(store.getMeta('test_key'), 'updated');
  } finally {
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
