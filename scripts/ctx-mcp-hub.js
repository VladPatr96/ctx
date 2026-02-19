#!/usr/bin/env node

/**
 * ctx-mcp-hub.js
 *
 * MCP Hub — тонкий оркестратор.
 * Регистрирует tools из доменных модулей: session, knowledge, consilium.
 *
 * Tools (13):
 * - Session:    ctx_log_action, ctx_log_error, ctx_get_session, ctx_get_tasks
 * - Knowledge:  ctx_get_project_map, ctx_search_solutions
 * - Consilium:  ctx_share_result, ctx_read_results, ctx_delegate_task, ctx_inner_consilium
 * - Pipeline:   ctx_get_pipeline, ctx_set_stage, ctx_update_pipeline
 * - Agents:     ctx_list_agents, ctx_create_agent
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { runCommand } from './utils/shell.js';
import { writeJsonAtomic } from './utils/state-io.js';
import { registerSessionTools } from './tools/session.js';
import { registerKnowledgeTools } from './tools/knowledge.js';
import { registerConsiliumTools } from './tools/consilium.js';
import { registerPipelineTools } from './tools/pipeline.js';
import { registerAgentTools } from './tools/agents.js';
import { createKnowledgeStore } from './knowledge/kb-json-fallback.js';
import { KbSync } from './knowledge/kb-sync.js';

// ==================== Config ====================

const DATA_DIR = process.env.CTX_DATA_DIR || join(process.cwd(), '.data');
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'VladPatr96';
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();

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
  return readJson(sessionFile) || {
    startedAt: new Date().toISOString(),
    project: basename(PROJECT_DIR),
    actions: [],
    errors: [],
    tasks: []
  };
}

function saveSession(session) { writeJson(sessionFile, session); }
function getResults() { return readJson(resultsFile) || []; }
function saveResults(results) { writeJson(resultsFile, results); }

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

// Register domain tools
registerSessionTools(server, { getSession, saveSession });
registerKnowledgeTools(server, { runCommand, readJson, DATA_DIR, GITHUB_OWNER, knowledgeStore, kbSync });
registerConsiliumTools(server, { getResults, saveResults });
registerPipelineTools(server);
registerAgentTools(server);

// ==================== Cleanup ====================

process.on('exit', () => {
  if (knowledgeStore && typeof knowledgeStore.close === 'function') {
    knowledgeStore.close();
  }
});

// ==================== Start ====================

const transport = new StdioServerTransport();
await server.connect(transport);
