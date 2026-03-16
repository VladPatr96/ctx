import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createCacheStore } from '../src/core/cache/cache-store.js';

const require = createRequire(import.meta.url);

function makeDb(dir) {
  const { DatabaseSync } = require('node:sqlite');
  const dbPath = join(dir, 'test-cache.sqlite');
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA journal_mode = WAL;');
  return db;
}

function makeTempDir() {
  return mkdtempSync(join(tmpdir(), 'ctx-cache-test-'));
}

// ---- L1 hit ----

test('L1 hit: set → get returns value', () => {
  const dir = makeTempDir();
  try {
    const db = makeDb(dir);
    const cache = createCacheStore(db);
    cache.set('foo', { bar: 42 });
    const val = cache.get('foo');
    assert.deepEqual(val, { bar: 42 });
    const s = cache.stats();
    assert.equal(s.l1.hits, 1);
    cache.close();
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- L2 promotion ----

test('L2 promotion: evict from L1, get restores from L2', () => {
  const dir = makeTempDir();
  try {
    const db = makeDb(dir);
    // Very small L1 to force eviction
    const cache = createCacheStore(db, { maxSize: 64 });

    cache.set('a', { data: 'x'.repeat(30) });
    cache.set('b', { data: 'y'.repeat(30) });
    // 'a' should be evicted from L1 due to small maxSize

    const val = cache.get('a');
    assert.deepEqual(val, { data: 'x'.repeat(30) });
    const s = cache.stats();
    // L1 miss → L2 hit → promoted
    assert.ok(s.l2.hits >= 1, 'should have at least 1 L2 hit');
    cache.close();
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- TTL expiry ----

test('TTL expiry: set with ttl → wait → get returns null', async () => {
  const dir = makeTempDir();
  try {
    const db = makeDb(dir);
    const cache = createCacheStore(db);
    cache.set('temp', { x: 1 }, { ttl: 50 });

    // Value should be there immediately
    assert.deepEqual(cache.get('temp'), { x: 1 });

    // Wait for TTL to expire
    await new Promise(r => setTimeout(r, 100));

    const val = cache.get('temp');
    assert.equal(val, null, 'should return null after TTL expires');
    cache.close();
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- getOrCompute ----

test('getOrCompute: computeFn called once, cached on second call', async () => {
  const dir = makeTempDir();
  try {
    const db = makeDb(dir);
    const cache = createCacheStore(db);
    let callCount = 0;

    const compute = async () => {
      callCount++;
      return { computed: true };
    };

    const v1 = await cache.getOrCompute('key1', compute);
    assert.deepEqual(v1, { computed: true });
    assert.equal(callCount, 1);

    const v2 = await cache.getOrCompute('key1', compute);
    assert.deepEqual(v2, { computed: true });
    assert.equal(callCount, 1, 'computeFn should not be called again');
    cache.close();
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- del ----

test('del: removes from both L1 and L2', () => {
  const dir = makeTempDir();
  try {
    const db = makeDb(dir);
    const cache = createCacheStore(db);
    cache.set('k', 'v');
    assert.equal(cache.has('k'), true);

    cache.del('k');
    assert.equal(cache.get('k'), null);
    assert.equal(cache.has('k'), false);
    cache.close();
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- stats ----

test('stats: hit/miss counters', () => {
  const dir = makeTempDir();
  try {
    const db = makeDb(dir);
    const cache = createCacheStore(db);
    cache.set('a', 1);
    cache.get('a');       // L1 hit
    cache.get('missing'); // L1 miss + L2 miss

    const s = cache.stats();
    assert.equal(s.l1.hits, 1);
    assert.equal(s.l1.misses, 1);
    assert.equal(s.l2.misses, 1);
    assert.equal(s.l1.count, 1);
    assert.ok(s.l2.count >= 1);
    cache.close();
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- cleanup ----

test('cleanup: expired entries removed from L2', async () => {
  const dir = makeTempDir();
  try {
    const db = makeDb(dir);
    const cache = createCacheStore(db);
    cache.set('exp1', 'val1', { ttl: 50 });
    cache.set('exp2', 'val2', { ttl: 50 });
    cache.set('keep', 'val3'); // no TTL

    await new Promise(r => setTimeout(r, 100));
    cache.cleanup();

    const s = cache.stats();
    // Only 'keep' should remain in L2
    assert.equal(s.l2.count, 1);
    cache.close();
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- has ----

test('has: returns true for L1 or L2 entries', () => {
  const dir = makeTempDir();
  try {
    const db = makeDb(dir);
    const cache = createCacheStore(db);
    cache.set('exist', 'yes');
    assert.equal(cache.has('exist'), true);
    assert.equal(cache.has('nope'), false);
    cache.close();
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

// ---- namespaces in stats ----

test('stats: namespaces breakdown', () => {
  const dir = makeTempDir();
  try {
    const db = makeDb(dir);
    const cache = createCacheStore(db);
    cache.set('metrics:global', { a: 1 });
    cache.set('metrics:task:code', { b: 2 });
    cache.set('routing:config', { c: 3 });

    const s = cache.stats();
    const nsMap = new Map(s.namespaces.map(n => [n.ns, n.cnt]));
    assert.equal(nsMap.get('metrics'), 2);
    assert.equal(nsMap.get('routing'), 1);
    cache.close();
    db.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
