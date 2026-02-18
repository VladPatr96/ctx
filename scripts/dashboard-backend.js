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

import { readFileSync, readdirSync, watch, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { URL } from 'node:url';
import * as actions from './dashboard-actions.js';

// 1. CONSTANTS
const DATA_DIR = '.data';
const PIPELINE_FILE = '.data/pipeline.json';
const INDEX_FILE = '.data/index.json';
const SESSION_FILE = '.data/session.json';
const LOG_FILE = '.data/log.jsonl';
const AGENTS_DIR = 'agents';
const CONSILIUM_FILE = 'consilium.presets.json';
const RESULTS_FILE = '.data/results.json';
const SKILLS_DIR = 'skills';
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
  results: [],
  progress: [],
  skills: [],
  lastEventId: 0
};

export const getStateSnapshot = () => JSON.parse(JSON.stringify(state));

const nextEventId = () => ++state.lastEventId;

// 3. DATA READERS
const safeReadJson = (path) => {
  try {
    if (!existsSync(path)) {
      console.warn(`[dashboard] Warning: File not found at ${path}`);
      return null;
    }
    const data = readFileSync(path, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error(`[dashboard] Error reading JSON from ${path}:`, err.message);
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

const readResultsJson = () => {
  const raw = safeReadJson(RESULTS_FILE);
  if (!Array.isArray(raw)) return [];
  const sorted = raw.slice(-50).sort((a, b) => new Date(a.time) - new Date(b.time));
  let runId = 0, prevTime = null;
  return sorted.map(r => {
    const t = new Date(r.time).getTime();
    if (prevTime && t - prevTime > 5000) runId++;
    prevTime = t;
    return { ...r, runId };
  });
};

const buildProgress = () => {
  const session = readSessionJson();
  if (!session) return [];
  const items = [];
  (session.actions || []).forEach(a =>
    items.push({ ts: a.time, kind: 'action', agent: a.action || '', file: a.file || '', result: a.result || '' })
  );
  (session.errors || []).forEach(e =>
    items.push({ ts: e.time, kind: 'error', agent: '', file: e.error || '', result: e.solution || '' })
  );
  return items.sort((a, b) => new Date(b.ts) - new Date(a.ts));
};

const readSkillsList = () => {
  try {
    if (!existsSync(SKILLS_DIR)) return [];
    const skills = [];
    const scan = (dir, prefix) => {
      readdirSync(dir, { withFileTypes: true }).forEach(e => {
        if (e.isDirectory()) scan(join(dir, e.name), prefix ? prefix + '/' + e.name : e.name);
        else if (e.name === 'SKILL.md') skills.push(prefix || basename(dir));
      });
    };
    scan(SKILLS_DIR, '');
    return skills;
  } catch { return []; }
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

  // Results, progress, skills
  state.results  = readResultsJson();
  state.progress = buildProgress();
  state.skills   = readSkillsList();

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
    if (existsSync(SKILLS_DIR)) watch(SKILLS_DIR, debouncedRefresh);
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
const parseBody = (req) => new Promise((resolve) => {
  let data = '';
  req.on('data', chunk => { data += chunk; });
  req.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve(null); } });
  req.on('error', () => resolve(null));
});

export const createRouter = (buildHtmlFn) => async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const serve = (status, type, data) => {
    res.writeHead(status, { 'Content-Type': type });
    res.end(typeof data === 'string' ? data : JSON.stringify(data));
  };

  if (req.method === 'POST') {
    const body = await parseBody(req);
    try {
      switch (url.pathname) {
        case '/api/pipeline/stage':
          actions.setStage(body?.stage);
          refreshAllData();
          return serve(200, 'application/json', { ok: true });
        case '/api/pipeline/task':
          actions.setTaskFull(body);
          refreshAllData();
          return serve(200, 'application/json', { ok: true });
        case '/api/pipeline/lead':
          actions.setLead(body?.lead);
          refreshAllData();
          return serve(200, 'application/json', { ok: true });
        case '/api/pipeline/reset':
          actions.resetPipeline();
          refreshAllData();
          return serve(200, 'application/json', { ok: true });
        case '/api/log/clear':
          actions.clearLog();
          refreshAllData();
          return serve(200, 'application/json', { ok: true });
        case '/api/agent/details':
          if (!body?.id) throw new Error('Agent ID is required');
          const agentPath = join(AGENTS_DIR, `${body.id}.md`);
          if (!existsSync(agentPath)) throw new Error('Agent not found');
          const content = readFileSync(agentPath, 'utf8');
          return serve(200, 'application/json', { content });
        case '/api/consilium/activate':
          actions.activatePreset(body?.preset);
          refreshAllData();
          return serve(200, 'application/json', { ok: true });
        default:
          return serve(404, 'application/json', { error: 'Not Found' });
      }
    } catch (err) {
      return serve(400, 'application/json', { error: err.message });
    }
  }

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
