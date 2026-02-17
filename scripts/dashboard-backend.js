/**
 * CTX Dashboard — Backend server logic
 *
 * Reads real data from:
 * - .data/pipeline.json   → pipeline state
 * - .data/index.json      → project map
 * - .data/session.json    → session actions/errors
 * - .data/log.jsonl       → event log
 * - agents/*.md           → agent definitions
 * - consilium.presets.json → consilium presets config
 */

import { readFileSync, readdirSync, watch, existsSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { URL } from 'node:url';

// 1. CONSTANTS
const DATA_DIR = '.data';
const PIPELINE_FILE = '.data/pipeline.json';
const INDEX_FILE = '.data/index.json';
const SESSION_FILE = '.data/session.json';
const LOG_FILE = '.data/log.jsonl';
const AGENTS_DIR = 'agents';
const CONSILIUM_FILE = 'consilium.presets.json';
const LOG_RING_SIZE = 50;
const POLL_INTERVAL_MS = 2000;
const DEBOUNCE_MS = 150;
const SSE_KEEPALIVE_MS = 15000;

// 2. STATE MANAGER
export const state = {
  pipeline: { stage: 'idle', task: '', lead: 'claude' },
  project: {},
  agents: [],
  consilium: [],
  log: [],
  lastEventId: 0
};

export const getStateSnapshot = () => JSON.parse(JSON.stringify(state));

const nextEventId = () => ++state.lastEventId;

// 3. DATA READERS
const safeReadJson = (path) => {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
};

const safeReadLines = (path) => {
  try {
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf8').split('\n').filter(l => l.trim());
  } catch {
    return [];
  }
};

const readPipelineJson = () => safeReadJson(PIPELINE_FILE);

const readIndexJson = () => safeReadJson(INDEX_FILE);

const readSessionJson = () => safeReadJson(SESSION_FILE);

const readLogJsonl = () => safeReadLines(LOG_FILE).slice(-LOG_RING_SIZE).map(l => {
  try { return JSON.parse(l); } catch { return null; }
}).filter(Boolean);

/** Extract skill names from backtick-wrapped references in agent .md */
const parseSkills = (content) => {
  const section = content.match(/(?:###|##|#)\s*Skills[\s\S]*?(?=\n(?:##|#\s)|---|\n## |$)/i);
  if (!section) return [];
  const matches = section[0].matchAll(/`(superpowers:[a-z-]+)`/g);
  return [...matches].map(m => m[1]);
};

const parseFrontmatter = (content) => {
  const roleMatch = content.match(/\*\*Role\*\*:\s*(.+)/i);
  const stageMatch = content.match(/\*\*Stage\*\*:\s*(.+)/i);
  return {
    role: roleMatch ? roleMatch[1].trim() : '',
    stage: stageMatch ? stageMatch[1].trim() : '',
    skills: parseSkills(content)
  };
};

const readAgentsMd = () => {
  try {
    if (!existsSync(AGENTS_DIR)) return [];
    return readdirSync(AGENTS_DIR)
      .filter(f => f.endsWith('.md') && !f.startsWith('_'))
      .map(f => {
        const content = readFileSync(join(AGENTS_DIR, f), 'utf8');
        const meta = parseFrontmatter(content);
        return { id: basename(f, '.md'), name: basename(f, '.md'), ...meta };
      });
  } catch {
    return [];
  }
};

/** Read consilium presets and format for frontend display */
const readConsiliumPresets = () => {
  const raw = safeReadJson(CONSILIUM_FILE);
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(raw).map(([key, val]) => ({
    name: key,
    description: val.description || '',
    providers: val.providers || [],
    agents: val.agents || []
  }));
};

/** Build unified log from session.json actions/errors + log.jsonl */
const buildLog = () => {
  const entries = [];

  // From session.json
  const session = readSessionJson();
  if (session) {
    (session.actions || []).forEach(a => {
      entries.push({
        ts: a.time,
        action: a.action || 'action',
        message: [a.file, a.result].filter(Boolean).join(' → ')
      });
    });
    (session.errors || []).forEach(e => {
      entries.push({
        ts: e.time,
        action: 'error',
        message: [e.error, e.solution].filter(Boolean).join(' → ')
      });
    });
  }

  // From log.jsonl
  const logEntries = readLogJsonl();
  entries.push(...logEntries);

  // Sort by timestamp and keep last N
  entries.sort((a, b) => {
    const ta = a.ts ? new Date(a.ts).getTime() : 0;
    const tb = b.ts ? new Date(b.ts).getTime() : 0;
    return ta - tb;
  });

  return entries.slice(-LOG_RING_SIZE);
};

/** Build project info from index.json */
const buildProjectInfo = () => {
  const idx = readIndexJson();
  if (!idx) return {};
  return {
    name: idx.project || '',
    stack: idx.stack || {},
    git: idx.git || {},
    structure: idx.structure || {},
    patterns: idx.patterns || {}
  };
};

export const refreshAllData = () => {
  // Pipeline
  const pipeData = readPipelineJson();
  if (pipeData) Object.assign(state.pipeline, pipeData);

  // Project
  state.project = buildProjectInfo();

  // Agents
  state.agents = readAgentsMd();

  // Consilium presets
  state.consilium = readConsiliumPresets();

  // Log
  state.log = buildLog();

  broadcast('full', getStateSnapshot());
};

// 4. FILE WATCHERS
const debounce = (fn, ms) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
};

export const startWatchers = (broadcastFn) => {
  if (broadcastFn) broadcast = broadcastFn;
  const debouncedRefresh = debounce(refreshAllData, DEBOUNCE_MS);
  try {
    if (existsSync(DATA_DIR)) watch(DATA_DIR, debouncedRefresh);
    if (existsSync(AGENTS_DIR)) watch(AGENTS_DIR, debouncedRefresh);
    if (existsSync(CONSILIUM_FILE)) watch(CONSILIUM_FILE, debouncedRefresh);
  } catch {
    setInterval(refreshAllData, POLL_INTERVAL_MS);
  }
};

// 5. SSE MANAGER
const sseClients = new Map();

const sseSend = (res, type, payload, id) => {
  res.write(`id: ${id}\nevent: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
};

export let broadcast = (type, payload) => {
  const id = nextEventId();
  sseClients.forEach(res => sseSend(res, type, payload, id));
};

export const sseConnect = (req, res, getStateFn) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  const clientId = Date.now();
  sseClients.set(clientId, res);
  sseSend(res, 'full', getStateFn(), nextEventId());
  const keepalive = setInterval(() => res.write(':keepalive\n\n'), SSE_KEEPALIVE_MS);
  req.on('close', () => {
    clearInterval(keepalive);
    sseClients.delete(clientId);
  });
};

// 6. HTTP ROUTER
export const createRouter = (buildHtmlFn) => (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const serve = (status, type, data) => {
    res.writeHead(status, { 'Content-Type': type });
    res.end(typeof data === 'string' ? data : JSON.stringify(data));
  };
  switch (url.pathname) {
    case '/': return serve(200, 'text/html', buildHtmlFn());
    case '/events': return sseConnect(req, res, getStateSnapshot);
    case '/state': return serve(200, 'application/json', getStateSnapshot());
    case '/health': return serve(200, 'text/plain', 'OK');
    default:
      res.writeHead(404);
      res.end('Not Found');
  }
};
