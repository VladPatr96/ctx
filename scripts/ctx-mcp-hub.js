#!/usr/bin/env node

/**
 * ctx-mcp-hub.js
 *
 * MCP Hub — тонкий оркестратор.
 * Регистрирует tools из доменных модулей: session, knowledge, consilium.
 *
 * Core tools + auto-discovered skill tools.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { runCommand } from './utils/shell.js';
import { writeJsonAtomic } from './utils/state-io.js';
import { createKnowledgeStore } from './knowledge/kb-json-fallback.js';
import { KbSync } from './knowledge/kb-sync.js';
import { createCacheStore } from './cache/cache-store.js';
import { registerCtxTools } from './mcp/register-ctx-tools.js';
import { resolveConfig } from './config/resolve-config.js';

// ==================== Config ====================

const config = resolveConfig({ detectGh: true });
const DATA_DIR = config.dataDir;
const GITHUB_OWNER = config.githubOwner || '';
const PROJECT_DIR = config.projectDir;

if (config.warnings.length > 0) {
  for (const w of config.warnings) console.warn(`[ctx] ${w}`);
}

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

// ==================== Shared utilities ====================

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function writeJson(file, data) {
  writeJsonAtomic(file, data);
}

// ==================== State ====================

const sessionFile = join(DATA_DIR, 'session.json');
const resultsFile = join(DATA_DIR, 'results.json');

function getSession() {
  if (cacheStore) {
    const cached = cacheStore.get('session:current');
    if (cached) return cached;
  }
  const session = readJson(sessionFile) || {
    startedAt: new Date().toISOString(),
    project: basename(PROJECT_DIR),
    actions: [],
    errors: [],
    tasks: []
  };
  if (cacheStore) {
    cacheStore.set('session:current', session);
  }
  return session;
}

function saveSession(session) {
  writeJson(sessionFile, session);
  if (cacheStore) {
    cacheStore.set('session:current', session);
  }
}
function getResults() { return readJson(resultsFile) || []; }
function saveResults(results) { writeJson(resultsFile, results); }

// ==================== Cache Store ====================

let cacheStore = null;
let cacheDb = null;
try {
  const { createRequire } = await import('node:module');
  const require = createRequire(import.meta.url);
  const { DatabaseSync } = require('node:sqlite');
  const cacheDbPath = join(DATA_DIR, 'state.sqlite');
  cacheDb = new DatabaseSync(cacheDbPath);
  cacheDb.exec('PRAGMA journal_mode = WAL;');
  cacheDb.exec('PRAGMA synchronous = NORMAL;');
  cacheDb.exec('PRAGMA busy_timeout = 2000;');
  cacheStore = createCacheStore(cacheDb);
} catch (err) {
  console.error('[mcp-hub] Cache store unavailable:', err.message);
}

// ==================== Knowledge Base ====================

let knowledgeStore = null;
let kbSync = null;

try {
  const kb = await createKnowledgeStore();
  knowledgeStore = kb.store;
  if (knowledgeStore) {
    kbSync = new KbSync();
    // Background pull at startup (non-blocking)
    kbSync.pull().catch(() => {});
  }
} catch {
  // KB unavailable — tools will report "KB disabled"
}

// ==================== MCP Server ====================

const server = new McpServer({ name: 'ctx-hub', version: '0.3.0' });

registerCtxTools(server, {
  getSession,
  saveSession,
  runCommand,
  readJson,
  DATA_DIR,
  GITHUB_OWNER,
  centralRepo: config.centralRepo,
  knowledgeStore,
  kbSync,
  getResults,
  saveResults,
  cacheStore,
});

// ==================== Cleanup ====================

async function shutdown() {
  if (kbSync) {
    try { await kbSync.flush(); } catch { /* ignore */ }
  }
  if (cacheStore) {
    try { cacheStore.close(); } catch { /* ignore */ }
  }
  if (cacheDb && typeof cacheDb.close === 'function') {
    try { cacheDb.close(); } catch { /* ignore */ }
  }
  if (knowledgeStore && typeof knowledgeStore.close === 'function') {
    knowledgeStore.close();
  }
}

process.on('exit', () => {
  // Sync cleanup only — async flush handled by SIGINT/SIGTERM
  if (cacheStore) {
    try { cacheStore.close(); } catch { /* ignore */ }
  }
  if (cacheDb && typeof cacheDb.close === 'function') {
    try { cacheDb.close(); } catch { /* ignore */ }
  }
  if (knowledgeStore && typeof knowledgeStore.close === 'function') {
    knowledgeStore.close();
  }
});

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, async () => {
    await shutdown();
    process.exit(0);
  });
}

// ==================== Start ====================

const transport = new StdioServerTransport();
await server.connect(transport);
