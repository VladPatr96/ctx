import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { StorageAdapter } from './storage-adapter.js';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_FILE = join(__dirname, 'schema.sql');

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

export class SqliteStore extends StorageAdapter {
  constructor(options = {}) {
    super();
    this.dataDir = options.dataDir || '.data';
    this.dbFile = options.dbFile || 'state.sqlite';
    ensureDir(this.dataDir);

    const DatabaseSync = loadDatabaseSync();
    this.dbPath = join(this.dataDir, this.dbFile);
    this.db = new DatabaseSync(this.dbPath);

    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA busy_timeout = 2000;');
    this.db.exec(readFileSync(SCHEMA_FILE, 'utf8'));

    this.prepareStatements();
  }

  prepareStatements() {
    this.getMetaStmt = this.db.prepare('SELECT value FROM meta WHERE key = ?');
    this.setMetaStmt = this.db.prepare(`
      INSERT INTO meta(key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    this.insertPipelineEventStmt = this.db.prepare(`
      INSERT INTO pipeline_events(ts, stage, lead, task, payload_json)
      VALUES (?, ?, ?, ?, ?)
    `);
    this.insertLogEventStmt = this.db.prepare(`
      INSERT INTO log_events(ts, action, message, payload_json)
      VALUES (?, ?, ?, ?)
    `);
    this.insertTaskHistoryStmt = this.db.prepare(`
      INSERT INTO task_history(ts, task, lead, stage, source)
      VALUES (?, ?, ?, ?, ?)
    `);
    this.clearLogEventsStmt = this.db.prepare('DELETE FROM log_events');
  }

  readPipeline(fallbackValue) {
    const row = this.getMetaStmt.get('pipeline_current_json');
    if (!row || typeof row.value !== 'string') return fallbackValue;
    try {
      return JSON.parse(row.value);
    } catch {
      return fallbackValue;
    }
  }

  writePipeline(pipeline) {
    const ts = new Date().toISOString();
    const payloadJson = JSON.stringify(pipeline, null, 2);
    const stage = typeof pipeline?.stage === 'string' ? pipeline.stage : '';
    const lead = typeof pipeline?.lead === 'string' ? pipeline.lead : '';
    const task = typeof pipeline?.task === 'string' ? pipeline.task : '';

    this.setMetaStmt.run('pipeline_current_json', payloadJson);
    this.setMetaStmt.run('pipeline_updated_at', ts);
    this.insertPipelineEventStmt.run(ts, stage, lead, task, payloadJson);
    if (task) {
      this.insertTaskHistoryStmt.run(ts, task, lead, stage, 'pipeline_write');
    }
  }

  appendLog(entry) {
    const normalized = {
      ts: entry?.ts || new Date().toISOString(),
      action: entry?.action || 'action',
      message: entry?.message || ''
    };
    this.insertLogEventStmt.run(
      normalized.ts,
      normalized.action,
      normalized.message,
      JSON.stringify(normalized)
    );
  }

  clearLog() {
    this.clearLogEventsStmt.run();
  }

  close() {
    if (this.db && typeof this.db.close === 'function') {
      this.db.close();
    }
  }
}
