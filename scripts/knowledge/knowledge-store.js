/**
 * KnowledgeStore — SQLite-based cross-project knowledge base with FTS5.
 *
 * Pattern from: scripts/storage/sqlite-store.js
 * - loadDatabaseSync via createRequire
 * - WAL mode, prepared statements
 * - SHA1 hash for deduplication
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_FILE = join(__dirname, 'knowledge-schema.sql');

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function loadDatabaseSync() {
  try {
    const mod = require('node:sqlite');
    if (!mod || typeof mod.DatabaseSync !== 'function') {
      throw new Error('node:sqlite DatabaseSync is unavailable');
    }
    return mod.DatabaseSync;
  } catch (err) {
    throw new Error(`node:sqlite is not available: ${err.message}`);
  }
}

export function computeHash(project, category, title, body) {
  const input = `${project}\0${category}\0${title}\0${body.slice(0, 500)}`;
  return createHash('sha1').update(input, 'utf8').digest('hex');
}

export class KnowledgeStore {
  constructor(options = {}) {
    const defaultDir = join(
      process.env.HOME || process.env.USERPROFILE || '.',
      '.config', 'ctx', 'knowledge'
    );
    this.dbDir = options.dbDir || defaultDir;
    this.dbPath = options.dbPath || process.env.CTX_KB_PATH || join(this.dbDir, 'knowledge.sqlite');

    ensureDir(dirname(this.dbPath));

    const DatabaseSync = loadDatabaseSync();
    this.db = new DatabaseSync(this.dbPath);

    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA busy_timeout = 2000;');
    this.db.exec(readFileSync(SCHEMA_FILE, 'utf8'));

    this.prepareStatements();
  }

  prepareStatements() {
    this.insertEntryStmt = this.db.prepare(`
      INSERT INTO kb_entries(hash, project, category, title, body, tags, source, github_url, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    this.hasEntryStmt = this.db.prepare('SELECT 1 FROM kb_entries WHERE hash = ?');

    this.searchStmt = this.db.prepare(`
      SELECT e.id, e.project, e.category, e.title, e.body, e.tags, e.source, e.github_url,
             e.created_at, e.access_count
      FROM kb_fts f
      JOIN kb_entries e ON e.id = f.rowid
      WHERE kb_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);

    this.getByProjectStmt = this.db.prepare(`
      SELECT id, project, category, title, body, tags, source, github_url, created_at, access_count
      FROM kb_entries
      WHERE project = ?
      ORDER BY updated_at DESC
      LIMIT ?
    `);

    this.bumpAccessStmt = this.db.prepare(`
      UPDATE kb_entries SET access_count = access_count + 1 WHERE id = ?
    `);

    this.saveSnapshotStmt = this.db.prepare(`
      INSERT INTO kb_snapshots(project, snapshot_json, created_at)
      VALUES (?, ?, ?)
    `);

    this.getSnapshotStmt = this.db.prepare(`
      SELECT snapshot_json, created_at FROM kb_snapshots
      WHERE project = ?
      ORDER BY created_at DESC
      LIMIT 1
    `);

    this.getMetaStmt = this.db.prepare('SELECT value FROM kb_meta WHERE key = ?');
    this.setMetaStmt = this.db.prepare(`
      INSERT INTO kb_meta(key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    this.countByCategoryStmt = this.db.prepare(`
      SELECT category, COUNT(*) as cnt FROM kb_entries GROUP BY category
    `);

    this.countByProjectStmt = this.db.prepare(`
      SELECT project, COUNT(*) as cnt FROM kb_entries GROUP BY project
    `);

    this.totalCountStmt = this.db.prepare('SELECT COUNT(*) as cnt FROM kb_entries');
  }

  hasEntry(hash) {
    return !!this.hasEntryStmt.get(hash);
  }

  saveEntry({ project, category, title, body, tags = '', source = '', github_url = '' }) {
    const hash = computeHash(project, category, title, body);
    if (this.hasEntry(hash)) {
      return { saved: false, reason: 'duplicate', hash };
    }
    const now = new Date().toISOString();
    this.insertEntryStmt.run(hash, project, category, title, body, tags, source, github_url, now, now);
    return { saved: true, hash };
  }

  searchEntries(query, { limit = 10, project = null } = {}) {
    // Sanitize FTS5 query — wrap each word in double quotes for safety
    const safeQuery = query
      .replace(/[^\w\s-]/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .map(w => `"${w}"`)
      .join(' ');

    if (!safeQuery) return [];

    try {
      let results = this.searchStmt.all(safeQuery, limit * 2);
      if (project) {
        results = results.filter(r => r.project === project);
      }
      results = results.slice(0, limit);

      for (const r of results) {
        this.bumpAccessStmt.run(r.id);
      }
      return results;
    } catch {
      return [];
    }
  }

  getContextForProject(project, limit = 5) {
    const entries = this.getByProjectStmt.all(project, limit);
    for (const e of entries) {
      this.bumpAccessStmt.run(e.id);
    }
    const snapshot = this.getSnapshot(project);
    return { entries, snapshot };
  }

  saveSnapshot(project, state) {
    const now = new Date().toISOString();
    this.saveSnapshotStmt.run(project, JSON.stringify(state), now);
  }

  getSnapshot(project) {
    const row = this.getSnapshotStmt.get(project);
    if (!row) return null;
    try {
      return { data: JSON.parse(row.snapshot_json), created_at: row.created_at };
    } catch {
      return null;
    }
  }

  getMeta(key) {
    const row = this.getMetaStmt.get(key);
    return row ? row.value : null;
  }

  setMeta(key, value) {
    this.setMetaStmt.run(key, value);
  }

  getStats() {
    const total = this.totalCountStmt.get().cnt;
    const byCategory = {};
    for (const row of this.countByCategoryStmt.all()) {
      byCategory[row.category] = row.cnt;
    }
    const byProject = {};
    for (const row of this.countByProjectStmt.all()) {
      byProject[row.project] = row.cnt;
    }
    return { total, byCategory, byProject };
  }

  importFromIssues(issues, project) {
    let imported = 0;
    let skipped = 0;
    for (const issue of issues) {
      const category = detectCategory(issue);
      const result = this.saveEntry({
        project: project || issue.repository?.name || 'unknown',
        category,
        title: issue.title || 'Untitled',
        body: issue.body || '',
        tags: (issue.labels || []).map(l => typeof l === 'string' ? l : l.name).join(','),
        source: 'github-issues',
        github_url: issue.url || issue.html_url || ''
      });
      if (result.saved) imported++;
      else skipped++;
    }
    return { imported, skipped };
  }

  close() {
    if (this.db && typeof this.db.close === 'function') {
      this.db.close();
    }
  }
}

function detectCategory(issue) {
  const labels = (issue.labels || []).map(l => (typeof l === 'string' ? l : l.name).toLowerCase());
  if (labels.includes('solution') || labels.includes('error')) return 'solution';
  if (labels.includes('decision')) return 'decision';
  if (labels.includes('pattern')) return 'pattern';
  if (labels.includes('lesson')) return 'error';
  if (labels.includes('session')) return 'session-summary';
  if (labels.includes('consilium')) return 'decision';
  return 'solution';
}
