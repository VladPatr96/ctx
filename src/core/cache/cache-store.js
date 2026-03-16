/**
 * cache-store.js — Two-level cache: L1 (LRU in-memory) + L2 (SQLite).
 *
 * get(key) → L1 hit → return
 *          → L1 miss → L2 hit → promote to L1 → return
 *                    → L2 miss → return null
 *
 * set(key, value, opts) → write L1 + write L2 (sync)
 * del(key)              → delete L1 + delete L2
 * getOrCompute(key, fn) → get() || fn() → set() → return
 */

import { LRUCache } from 'lru-cache';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_FILE = join(__dirname, 'cache-schema.sql');

/**
 * Create a two-level cache store backed by an existing SQLite DatabaseSync instance.
 *
 * @param {object} db — node:sqlite DatabaseSync instance (already opened)
 * @param {object} [options]
 * @param {number} [options.maxSize=52428800] — L1 max size in bytes (default 50MB)
 * @param {number} [options.defaultTtlMs] — default TTL in ms (no default = no expiry)
 * @returns {object} cache API
 */
export function createCacheStore(db, options = {}) {
  const maxSize = options.maxSize ?? 50 * 1024 * 1024;

  // ---- Init L2 schema ----
  db.exec(readFileSync(SCHEMA_FILE, 'utf8'));

  // ---- L1: in-memory LRU ----
  const l1 = new LRUCache({
    maxSize,
    sizeCalculation(value) {
      return value._sizeBytes || 128;
    },
  });

  // ---- L2: prepared statements ----
  const l2Get = db.prepare('SELECT value_blob, expires_at FROM cache WHERE key = ?');
  const l2Set = db.prepare(`
    INSERT OR REPLACE INTO cache(key, value_blob, created_at, expires_at, content_hash, size_bytes)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const l2Del = db.prepare('DELETE FROM cache WHERE key = ?');
  const l2Has = db.prepare('SELECT 1 FROM cache WHERE key = ?');
  const l2Cleanup = db.prepare("DELETE FROM cache WHERE expires_at IS NOT NULL AND expires_at < ?");
  const l2CountStmt = db.prepare('SELECT COUNT(*) as cnt FROM cache');
  const l2SizeStmt = db.prepare('SELECT COALESCE(SUM(size_bytes), 0) as total FROM cache');
  const l2NamespaceStmt = db.prepare(`
    SELECT
      CASE WHEN INSTR(key, ':') > 0 THEN SUBSTR(key, 1, INSTR(key, ':') - 1) ELSE key END as ns,
      COUNT(*) as cnt,
      SUM(size_bytes) as size
    FROM cache GROUP BY ns
  `);

  // ---- Counters ----
  let l1Hits = 0;
  let l1Misses = 0;
  let l2Hits = 0;
  let l2Misses = 0;

  // ---- Helpers ----

  function serialize(value) {
    const json = JSON.stringify(value);
    const buf = Buffer.from(json, 'utf8');
    return { buf, sizeBytes: buf.length };
  }

  function deserialize(blob) {
    const str = typeof blob === 'string' ? blob : Buffer.from(blob).toString('utf8');
    return JSON.parse(str);
  }

  function isExpired(expiresAt) {
    if (!expiresAt) return false;
    return new Date(expiresAt).getTime() <= Date.now();
  }

  // ---- API ----

  function get(key) {
    // L1
    const cached = l1.get(key);
    if (cached !== undefined) {
      l1Hits++;
      return cached.value;
    }
    l1Misses++;

    // L2
    try {
      const row = l2Get.get(key);
      if (!row) {
        l2Misses++;
        return null;
      }
      if (isExpired(row.expires_at)) {
        // Lazy cleanup
        try { l2Del.run(key); } catch { /* ignore */ }
        l2Misses++;
        return null;
      }
      l2Hits++;
      const value = deserialize(row.value_blob);
      const sizeBytes = typeof row.value_blob === 'string' ? row.value_blob.length : row.value_blob.byteLength;
      // Promote to L1
      l1.set(key, { value, _sizeBytes: sizeBytes });
      return value;
    } catch {
      l2Misses++;
      return null;
    }
  }

  function set(key, value, opts = {}) {
    const { ttl, hash } = opts;
    const { buf, sizeBytes } = serialize(value);
    const now = new Date().toISOString();
    const expiresAt = ttl ? new Date(Date.now() + ttl).toISOString() : null;

    // L1
    const ttlOpts = ttl ? { ttl } : {};
    l1.set(key, { value, _sizeBytes: sizeBytes }, ttlOpts);

    // L2
    try {
      l2Set.run(key, buf, now, expiresAt, hash ?? null, sizeBytes);
    } catch (err) {
      console.error('[cache-store] L2 set failed:', err.message);
    }
  }

  function del(key) {
    l1.delete(key);
    try {
      l2Del.run(key);
    } catch (err) {
      console.error('[cache-store] L2 del failed:', err.message);
    }
  }

  function has(key) {
    if (l1.has(key)) return true;
    try {
      return !!l2Has.get(key);
    } catch {
      return false;
    }
  }

  async function getOrCompute(key, computeFn, opts = {}) {
    const cached = get(key);
    if (cached !== null) return cached;
    const value = await computeFn();
    set(key, value, opts);
    return value;
  }

  function stats() {
    let l2Count = 0;
    let l2SizeBytes = 0;
    let namespaces = [];
    try {
      l2Count = l2CountStmt.get()?.cnt || 0;
      l2SizeBytes = l2SizeStmt.get()?.total || 0;
      namespaces = l2NamespaceStmt.all();
    } catch { /* ignore */ }

    return {
      l1: {
        size: l1.calculatedSize,
        count: l1.size,
        hits: l1Hits,
        misses: l1Misses,
        hitRate: (l1Hits + l1Misses) > 0
          ? +((l1Hits / (l1Hits + l1Misses)) * 100).toFixed(1)
          : 0,
      },
      l2: {
        count: l2Count,
        sizeBytes: l2SizeBytes,
        hits: l2Hits,
        misses: l2Misses,
        hitRate: (l2Hits + l2Misses) > 0
          ? +((l2Hits / (l2Hits + l2Misses)) * 100).toFixed(1)
          : 0,
      },
      namespaces,
    };
  }

  function cleanup() {
    const now = new Date().toISOString();
    try {
      l2Cleanup.run(now);
    } catch (err) {
      console.error('[cache-store] cleanup failed:', err.message);
    }
  }

  function close() {
    cleanup();
    l1.clear();
  }

  return { get, set, del, has, getOrCompute, stats, cleanup, close };
}
