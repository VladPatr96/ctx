/**
 * JSON-based KnowledgeStore fallback (no SQLite dependency).
 * Same API as KnowledgeStore but uses a plain JSON file.
 *
 * Pattern from: scripts/storage/index.js (factory with fallback)
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function computeHash(project, category, title, body) {
  const input = `${project}\0${category}\0${title}\0${body.slice(0, 500)}`;
  return createHash('sha1').update(input, 'utf8').digest('hex');
}

export class JsonKnowledgeStore {
  constructor(options = {}) {
    const defaultDir = join(
      process.env.HOME || process.env.USERPROFILE || '.',
      '.config', 'ctx', 'knowledge'
    );
    this.dbDir = options.dbDir || defaultDir;
    this.filePath = options.filePath || join(this.dbDir, 'knowledge.json');

    ensureDir(dirname(this.filePath));
    this.data = this._load();
  }

  _load() {
    try {
      return JSON.parse(readFileSync(this.filePath, 'utf-8'));
    } catch {
      return { entries: [], snapshots: {}, meta: {} };
    }
  }

  _save() {
    writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8');
  }

  hasEntry(hash) {
    return this.data.entries.some(e => e.hash === hash);
  }

  saveEntry({ project, category, title, body, tags = '', source = '', github_url = '' }) {
    const hash = computeHash(project, category, title, body);
    const existing = this.data.entries.find(
      e => e.project === project && e.category === category && e.title === title
    );

    if (existing) {
      if (existing.hash === hash) {
        return { saved: false, reason: 'duplicate', hash };
      }
      const previousHash = existing.hash;
      existing.hash = hash;
      existing.body = body;
      existing.tags = tags;
      existing.source = source;
      existing.github_url = github_url;
      existing.updated_at = new Date().toISOString();
      existing.version_count = (existing.version_count || 1) + 1;
      this._save();
      return { saved: true, updated: true, hash, previous_hash: previousHash, version: existing.version_count };
    }

    const now = new Date().toISOString();
    this.data.entries.push({
      id: this.data.entries.length + 1,
      hash, project, category, title, body, tags, source, github_url,
      created_at: now, updated_at: now, access_count: 0, version_count: 1
    });
    this._save();
    return { saved: true, hash };
  }

  searchEntries(query, { limit = 10, project = null, category = null, dateFrom = null } = {}) {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return [];

    let results = this.data.entries
      .map(e => {
        const text = `${e.title} ${e.body}`.toLowerCase();
        const score = terms.reduce((s, t) => s + (text.includes(t) ? 1 : 0), 0);
        return { ...e, score };
      })
      .filter(e => e.score > 0);

    if (project) results = results.filter(r => r.project === project);
    if (category) results = results.filter(r => r.category === category);
    if (dateFrom) results = results.filter(r => r.created_at >= dateFrom);

    results.sort((a, b) => b.score - a.score);
    results = results.slice(0, limit);

    for (const r of results) {
      const entry = this.data.entries.find(e => e.id === r.id);
      if (entry) entry.access_count++;
    }
    if (results.length) this._save();

    return results.map(({ score, ...rest }) => rest);
  }

  getContextForProject(project, limit = 5) {
    const entries = this.data.entries
      .filter(e => e.project === project)
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .slice(0, limit);

    for (const e of entries) {
      e.access_count++;
    }
    if (entries.length) this._save();

    const snapshot = this.getSnapshot(project);
    return { entries, snapshot };
  }

  saveSnapshot(project, state) {
    this.data.snapshots[project] = {
      data: state,
      created_at: new Date().toISOString()
    };
    this._save();
  }

  getSnapshot(project) {
    return this.data.snapshots[project] || null;
  }

  getMeta(key) {
    return this.data.meta[key] || null;
  }

  setMeta(key, value) {
    this.data.meta[key] = value;
    this._save();
  }

  getStats() {
    const total = this.data.entries.length;
    const byCategory = {};
    const byProject = {};
    for (const e of this.data.entries) {
      byCategory[e.category] = (byCategory[e.category] || 0) + 1;
      byProject[e.project] = (byProject[e.project] || 0) + 1;
    }
    return { total, byCategory, byProject };
  }

  importFromIssues(issues, project) {
    let imported = 0;
    let skipped = 0;
    for (const issue of issues) {
      const labels = (issue.labels || []).map(l => typeof l === 'string' ? l : l.name);
      const labelsLower = labels.map(l => l.toLowerCase());
      let category = 'solution';
      if (labelsLower.includes('decision') || labelsLower.includes('consilium')) category = 'decision';
      else if (labelsLower.includes('pattern')) category = 'pattern';
      else if (labelsLower.includes('lesson') || labelsLower.includes('error')) category = 'error';
      else if (labelsLower.includes('session')) category = 'session-summary';

      const result = this.saveEntry({
        project: project || issue.repository?.name || 'unknown',
        category,
        title: issue.title || 'Untitled',
        body: issue.body || '',
        tags: labels.join(','),
        source: 'github-issues',
        github_url: issue.url || issue.html_url || ''
      });
      if (result.saved) imported++;
      else skipped++;
    }
    return { imported, skipped };
  }

  close() {
    // no-op for JSON store
  }
}

/**
 * Factory: creates KnowledgeStore (SQLite) with JSON fallback.
 * Pattern from: scripts/storage/index.js
 */
export async function createKnowledgeStore(options = {}) {
  if (parseBool(process.env.CTX_KB_DISABLED)) {
    return { store: null, mode: 'disabled' };
  }

  const warn = typeof options.onWarning === 'function' ? options.onWarning : () => {};

  try {
    const { KnowledgeStore } = await import('./knowledge-store.js');
    const store = new KnowledgeStore(options);
    return { store, mode: 'sqlite' };
  } catch (err) {
    warn(`SQLite KnowledgeStore unavailable: ${err.message}. Falling back to JSON.`);
  }

  try {
    const store = new JsonKnowledgeStore(options);
    return { store, mode: 'json' };
  } catch (err) {
    return { store: null, mode: 'error', error: err.message };
  }
}

function parseBool(value) {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}
