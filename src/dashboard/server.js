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

import { readFileSync, readdirSync, watch, existsSync, mkdirSync, appendFileSync, writeFileSync } from 'node:fs';
import { exec } from 'node:child_process';
import { join, basename, resolve, sep, relative } from 'node:path';
import { URL } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import * as actions from './actions.js';
import { createKnowledgeStore } from '../knowledge/kb-json-fallback.js';
import { KbSync } from '../knowledge/kb-sync.js';
import { runDevelopmentPipeline, createDevelopmentPipeline } from '../orchestrator/development-pipeline.js';
import * as termSessions from '../../scripts/terminal-sessions.js';
import { getCostSummary, getCostsByProvider } from '../cost-tracking/index.js';
import { getRecommendations } from '../cost-tracking/optimization-engine.js';
import { getBudgetConfig, checkAllBudgets } from '../cost-tracking/budget-alerts.js';
import { resolveDataDir } from '../core/storage/index.js';
import { createDashboardStateStore } from '../core/storage/dashboard-state-store.js';
import { createShellSummary } from '../contracts/shell-schemas.js';
import { discoverAllModelsAsync } from '../providers/model-discovery.js';
import { buildAnalyticsSummary } from '../../scripts/analytics/summary.js';
import { buildRoutingExplainability } from '../../scripts/analytics/routing-explainability.js';
import { listProviderExtensibilityInventory } from '../providers/index.js';
import { buildRuntimeFallbackInventory } from '../contracts/runtime-fallback-schemas.js';
import { buildProviderRecoveryInventory } from '../contracts/provider-recovery-schemas.js';
import { buildResilienceAuditInventory } from '../contracts/resilience-audit-schemas.js';
import {
  buildConsiliumObservabilitySnapshot,
  createConsiliumObservabilitySnapshot,
} from '../contracts/consilium-observability.js';
import {
  buildConsiliumReplayArchive,
  buildConsiliumReplayExport,
  buildConsiliumReplayKnowledgeContext,
} from '../contracts/consilium-replay-schemas.js';
import {
  createRoutingFeedbackRecord,
  parseRoutingFeedbackPayload,
} from '../contracts/routing-feedback-schemas.js';

// 1. CONSTANTS
const DATA_DIR = resolveDataDir();
const TOKEN_FILE = join(DATA_DIR, '.dashboard-token');
const COST_TRACKING_FILE = join(DATA_DIR, 'cost-tracking.json');
const AGENTS_DIR = 'agents';
const CONSILIUM_FILE = 'consilium.presets.json';
const SKILLS_DIR = 'skills';
const SCRIPTS_DIR = 'scripts';
const LOG_RING_SIZE = 50;
const POLL_INTERVAL_MS = 2000;
const DEBOUNCE_MS = 150;
const SSE_KEEPALIVE_MS = 15000;
const SSE_RETRY_MS = 3000;
const SSE_REPLAY_SIZE = 100;
const MAX_BODY_BYTES = 1024 * 1024;
const AGENT_ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const RATE_LIMIT_MAX = 30;          // max POST requests per minute per IP
const RATE_LIMIT_WINDOW_MS = 60000; // 1 minute
const ALLOWED_ORIGINS = ['http://127.0.0.1', 'http://localhost', 'null'];
const KB_CATEGORY_SET = new Set(['solution', 'decision', 'pattern', 'error', 'session-summary']);
const SECURE_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin'
};
const APP_CSP = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:;";

// 1b. AUTH TOKEN
let authToken = '';
export function initAuthToken() {
  if (authToken) return authToken;   // idempotent — only generate once
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  authToken = randomBytes(24).toString('hex');
  writeFileSync(TOKEN_FILE, authToken, 'utf8');
  return authToken;
}

// 1c. RATE LIMITER (in-memory, per IP)
const rateBuckets = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  let bucket = rateBuckets.get(ip);
  if (!bucket || now - bucket.start > RATE_LIMIT_WINDOW_MS) {
    bucket = { start: now, count: 0 };
    rateBuckets.set(ip, bucket);
  }
  bucket.count++;
  return bucket.count <= RATE_LIMIT_MAX;
}
// Clean stale buckets every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW_MS * 2;
  for (const [ip, b] of rateBuckets) if (b.start < cutoff) rateBuckets.delete(ip);
}, 300000).unref();

let kbRuntimePromise = null;
let kbSyncClient = null;
let _dashboardEvalStorePromise = null;
const dashboardStateStore = createDashboardStateStore({
  dataDir: DATA_DIR,
  preferred: process.env.CTX_STORAGE,
  sqliteFallbackJson: process.env.CTX_SQLITE_FALLBACK_JSON,
  onWarning: (message) => console.warn(`[storage] ${message}`)
});

async function getDashboardEvalStore() {
  if (!_dashboardEvalStorePromise) {
    _dashboardEvalStorePromise = import('../evaluation/eval-store.js').then(({ createEvalStore }) => {
      try { return createEvalStore(DATA_DIR); } catch { return null; }
    }).catch(() => null);
  }
  return _dashboardEvalStorePromise;
}

async function getKnowledgeRuntime() {
  if (!kbRuntimePromise) {
    kbRuntimePromise = createKnowledgeStore({
      dbPath: process.env.CTX_KB_PATH,
      onWarning: (message) => console.warn(`[knowledge] ${message}`)
    });
  }
  return kbRuntimePromise;
}

function getKbSyncClient() {
  if (!kbSyncClient) {
    kbSyncClient = new KbSync();
  }
  return kbSyncClient;
}

export async function resetDashboardRuntimeCachesForTests() {
  if (kbRuntimePromise) {
    try {
      const runtime = await kbRuntimePromise;
      runtime?.store?.close?.();
    } catch {
      // Best-effort cleanup for hermetic test runs.
    }
  }

  if (_dashboardEvalStorePromise) {
    try {
      const evalStore = await _dashboardEvalStorePromise;
      evalStore?.close?.();
    } catch {
      // Best-effort cleanup for hermetic test runs.
    }
  }

  kbRuntimePromise = null;
  kbSyncClient = null;
  _dashboardEvalStorePromise = null;
}

function getExpectedToken(token) {
  return token || authToken;
}

function readRequestToken(req, url) {
  const authHeader = req.headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  return url.searchParams.get('token') || '';
}

function isAuthorized(req, url, token) {
  const expected = getExpectedToken(token);
  const provided = readRequestToken(req, url);
  if (!expected || !provided) return false;
  // Constant-time comparison to prevent timing attacks
  const expectedBuf = Buffer.from(expected, 'utf8');
  const providedBuf = Buffer.from(provided, 'utf8');
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

function getClientIp(req) {
  return req.socket?.remoteAddress || '0.0.0.0';
}

function parsePositiveInt(raw, fallback, min = 1, max = 1000) {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  if (parsed < min) return min;
  if (parsed > max) return max;
  return parsed;
}

function parseConsiliumProvider(raw) {
  const value = String(raw || '').trim().toLowerCase();
  return value || null;
}

function parseConsiliumConsensus(raw) {
  const value = String(raw || '').trim().toLowerCase();
  return value === 'consensus' || value === 'open' ? value : 'all';
}

function parseJsonArray(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function runMatchesConsiliumFilters(run, { project = null, provider = null, consensus = 'all' } = {}) {
  if (project && String(run?.project || '').trim() !== project) {
    return false;
  }

  if (provider) {
    const participantSet = new Set([
      ...parseJsonArray(run?.providers_invoked),
      ...parseJsonArray(run?.providers_responded),
      run?.proposed_by,
    ].map((value) => String(value || '').trim().toLowerCase()).filter(Boolean));

    if (!participantSet.has(provider)) {
      return false;
    }
  }

  if (consensus === 'consensus') {
    return Boolean(run?.consensus_reached);
  }

  if (consensus === 'open') {
    return !Boolean(run?.consensus_reached);
  }

  return true;
}

function filterConsiliumRuns(runs, filters) {
  return (Array.isArray(runs) ? runs : []).filter((run) => runMatchesConsiliumFilters(run, filters));
}

function buildKnowledgeShellHref({ project = null, query = null, focusId = null } = {}) {
  const params = new URLSearchParams({ tab: 'knowledge' });
  if (project) params.set('kb_project', project);
  if (query) params.set('kb_query', query);
  if (focusId !== null && focusId !== undefined) params.set('kb_focus', String(focusId));
  return `?${params.toString()}`;
}

function buildReplayKnowledgeQuery(run, providerResponses = []) {
  const stopwords = new Set(['a', 'an', 'and', 'the', 'with', 'for', 'to', 'of', 'in', 'on', 'or', 'is']);
  const fragments = [
    run?.topic,
    run?.decision_summary,
    ...(Array.isArray(providerResponses) ? providerResponses.map((response) => response?.key_idea) : []),
  ]
    .map((value) => String(value || '').replace(/[^\p{L}\p{N}\s-]+/gu, ' ').trim())
    .filter(Boolean);

  if (fragments.length === 0) {
    return 'consilium decision';
  }

  const tokens = [];
  const seen = new Set();
  for (const fragment of fragments) {
    for (const token of fragment.split(/\s+/)) {
      const normalized = token.trim();
      if (!normalized) continue;
      const key = normalized.toLowerCase();
      if (stopwords.has(key)) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      tokens.push(normalized);
      if (tokens.length >= 4) {
        return tokens.join(' ');
      }
    }
  }

  return tokens.join(' ') || 'consilium decision';
}

async function buildReplayKnowledgeContext(detail) {
  if (!detail?.run) return null;

  const project = String(detail.run.project || '').trim();
  if (!project) return null;

  let runtime = null;
  try {
    runtime = await getKnowledgeRuntime();
  } catch {
    return null;
  }

  if (!runtime?.store || typeof runtime.store.searchEntries !== 'function') {
    return null;
  }

  const query = buildReplayKnowledgeQuery(detail.run, detail.providerResponses);
  const entries = runtime.store.searchEntries(query, { limit: 4, project });
  const continuity = typeof runtime.store.getContinuityDigest === 'function'
    ? runtime.store.getContinuityDigest(project, 3)
    : null;
  const runId = String(detail.run.run_id || 'consilium-run').trim() || 'consilium-run';

  return buildConsiliumReplayKnowledgeContext({
    project,
    query,
    actions: [
      {
        id: `${runId}:knowledge_search`,
        type: 'knowledge_search',
        label: 'Open related knowledge',
        href: buildKnowledgeShellHref({ project, query }),
        project,
        query,
      },
      {
        id: `${runId}:knowledge_project`,
        type: 'knowledge_project',
        label: 'Open project continuity',
        href: buildKnowledgeShellHref({ project }),
        project,
        query: null,
      },
    ],
    entries: entries.map((entry) => ({
      id: entry.id,
      project: entry.project,
      category: entry.category,
      title: entry.title,
      body: entry.body,
      href: buildKnowledgeShellHref({
        project: entry.project,
        query: entry.title,
        focusId: entry.id,
      }),
      updatedAt: entry.updated_at || entry.created_at || null,
      source: entry.source || null,
      githubUrl: entry.github_url || null,
      retrieval: {
        score: typeof entry?.retrieval?.score === 'number' ? entry.retrieval.score : null,
        matchReason: entry?.retrieval?.matchReason || null,
      },
    })),
    continuity,
  });
}

function normalizeKbEntry(body) {
  const payload = body || {};
  const project = String(payload.project || '').trim();
  const category = String(payload.category || '').trim();
  const title = String(payload.title || '').trim();
  const data = String(payload.body || '').trim();
  const tags = typeof payload.tags === 'string' ? payload.tags.trim() : '';
  const source = typeof payload.source === 'string' ? payload.source.trim() : '';
  const github_url = typeof payload.github_url === 'string' ? payload.github_url.trim() : '';

  if (!project) throw new Error('project is required');
  if (!KB_CATEGORY_SET.has(category)) throw new Error(`category must be one of: ${Array.from(KB_CATEGORY_SET).join(', ')}`);
  if (!title) throw new Error('title is required');
  if (!data) throw new Error('body is required');

  return {
    project: project.slice(0, 120),
    category,
    title: title.slice(0, 240),
    body: data.slice(0, 20000),
    tags: tags.slice(0, 300),
    source: source.slice(0, 200),
    github_url: github_url.slice(0, 500)
  };
}

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
  storageHealth: null,
  providerHealth: {},
  brainstorm: null,
  plan: null,
  claimGraph: null,
  consiliumObservability: null,
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

const readPipelineJson = () => dashboardStateStore.readPipeline(null);
const readIndexJson = () => dashboardStateStore.readProjectIndex();
const readProviderHealthJson = () => dashboardStateStore.readProviderHealth();
const readSessionJson = () => dashboardStateStore.readSession();
const readLogJsonl = () => dashboardStateStore.readLog(LOG_RING_SIZE);

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
  const raw = dashboardStateStore.readResults();
  if (!raw) return [];
  if (!Array.isArray(raw) && Array.isArray(raw.providers)) {
    const baseTs = raw.generatedAt || new Date().toISOString();
    return raw.providers.map((entry, idx) => ({
      time: baseTs,
      provider: entry.provider,
      task: raw.topic || 'consilium',
      result: entry.response || entry.error || '',
      confidence: null,
      runId: idx
    }));
  }
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
  state.results = readResultsJson();
  state.progress = buildProgress();
  state.skills = readSkillsList();
  const storageHealth = typeof actions.getStorageHealth === 'function'
    ? actions.getStorageHealth()
    : null;
  state.storageHealth = storageHealth
    ? { ...storageHealth, sources: dashboardStateStore.getSourceMap() }
    : { sources: dashboardStateStore.getSourceMap() };
  state.providerHealth = readProviderHealthJson() || {};

  // Brainstorm + Plan from pipeline.json
  state.brainstorm = pipeData ? (pipeData.brainstorm || null) : null;
  state.plan = pipeData ? (pipeData.plan || null) : null;

  broadcast('full', getStateSnapshot());
};

/** Set the full claim graph from consilium multi-round tool */
export function setClaimGraph(graph) {
  state.claimGraph = graph ? { ...graph, userVerdicts: state.claimGraph?.userVerdicts || {} } : null;
  broadcast('full', getStateSnapshot());
}

export function setConsiliumObservability(snapshot) {
  state.consiliumObservability = snapshot
    ? createConsiliumObservabilitySnapshot(snapshot)
    : null;
  broadcast('full', getStateSnapshot());
}

export function recordConsiliumObservability(result, options = {}) {
  const snapshot = buildConsiliumObservabilitySnapshot(result, options);
  state.consiliumObservability = snapshot;
  broadcast('full', getStateSnapshot());
  return snapshot;
}

// 4. FILE WATCHERS
const debounce = (fn, ms) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => fn(...args), ms);
  };
};

export const startWatchers = (broadcastFn, reloadFrontendFn) => {
  if (broadcastFn) broadcast = broadcastFn;
  const debouncedRefresh = debounce(refreshAllData, DEBOUNCE_MS);
  const debouncedReload = debounce(async (_eventType, filename) => {
    try {
      const file = typeof filename === 'string' ? filename : (filename ? filename.toString() : '');
      if (!file || !file.endsWith('.js')) return;
      if (reloadFrontendFn && file.includes('frontend')) {
        await reloadFrontendFn();
      }
      broadcast('reload', { file });
    } catch (err) {
      console.error('[dashboard] Reload watcher error:', err.message);
    }
  }, DEBOUNCE_MS);
  const debouncedCostUpdate = debounce(() => {
    try {
      const summary = getCostSummary();
      const byProvider = getCostsByProvider();
      const recommendations = getRecommendations();
      const config = getBudgetConfig();
      const costs = {
        total: summary.totalCost || 0,
        byProvider
      };
      const budgetStatus = checkAllBudgets(costs);
      broadcast('cost-update', {
        summary,
        byProvider,
        recommendations,
        budget: {
          config,
          status: budgetStatus
        }
      });
    } catch (err) {
      console.error('[dashboard] Cost update error:', err.message);
    }
  }, DEBOUNCE_MS);
  try {
    if (existsSync(DATA_DIR)) watch(DATA_DIR, debouncedRefresh);
    if (existsSync(AGENTS_DIR)) watch(AGENTS_DIR, debouncedRefresh);
    if (existsSync(CONSILIUM_FILE)) watch(CONSILIUM_FILE, debouncedRefresh);
    if (existsSync(SKILLS_DIR)) watch(SKILLS_DIR, debouncedRefresh);
    if (existsSync(SCRIPTS_DIR)) watch(SCRIPTS_DIR, debouncedReload);
    if (existsSync(COST_TRACKING_FILE)) watch(COST_TRACKING_FILE, debouncedCostUpdate);
  } catch {
    setInterval(refreshAllData, POLL_INTERVAL_MS);
  }
};

// 5. SSE MANAGER
const sseClients = new Map();
const sseEventRing = [];

const sseSend = (res, type, payload, id) => {
  try {
    res.write(`id: ${id}\nevent: ${type}\ndata: ${JSON.stringify(payload)}\n\n`);
    return true;
  } catch {
    return false;
  }
};

const pushReplayEvent = (id, type, payload) => {
  sseEventRing.push({ id, type, payload });
  if (sseEventRing.length > SSE_REPLAY_SIZE) {
    sseEventRing.splice(0, sseEventRing.length - SSE_REPLAY_SIZE);
  }
};

const parseLastEventId = (req, url) => {
  const fromHeader = req.headers['last-event-id'];
  const fromQuery = url?.searchParams.get('lastEventId');
  const raw = String(fromHeader ?? fromQuery ?? '').trim();
  if (!raw) return null;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

export let broadcast = (type, payload) => {
  const id = nextEventId();
  pushReplayEvent(id, type, payload);
  for (const [clientId, res] of sseClients) {
    if (!sseSend(res, type, payload, id)) {
      sseClients.delete(clientId);
    }
  }
};

export const sseConnect = (req, res, getStateFn, url) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write(`retry: ${SSE_RETRY_MS}\n\n`);

  const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  sseClients.set(clientId, res);

  const lastEventId = parseLastEventId(req, url);
  const replay = lastEventId === null
    ? []
    : sseEventRing.filter(event => event.id > lastEventId);

  if (replay.length > 0) {
    replay.forEach(event => sseSend(res, event.type, event.payload, event.id));
  } else {
    const full = getStateFn();
    const fullId = nextEventId();
    pushReplayEvent(fullId, 'full', full);
    sseSend(res, 'full', full, fullId);
  }

  const disconnect = () => {
    clearInterval(keepalive);
    sseClients.delete(clientId);
  };

  const keepalive = setInterval(() => {
    try {
      res.write(':keepalive\n\n');
    } catch {
      disconnect();
    }
  }, SSE_KEEPALIVE_MS);

  req.on('close', disconnect);
  req.on('error', disconnect);
};

// 6. HTTP ROUTER
const parseBody = (req) => new Promise((resolve) => {
  let totalBytes = 0;
  const chunks = [];
  let tooLarge = false;

  req.on('data', chunk => {
    if (tooLarge) return;
    totalBytes += chunk.length;
    if (totalBytes > MAX_BODY_BYTES) {
      tooLarge = true;
      return;
    }
    chunks.push(chunk);
  });

  req.on('end', () => {
    if (tooLarge) {
      resolve({ error: 'payload_too_large' });
      return;
    }

    const raw = Buffer.concat(chunks).toString('utf8').trim();
    if (!raw) {
      resolve({ body: null });
      return;
    }

    try {
      resolve({ body: JSON.parse(raw) });
    } catch {
      resolve({ error: 'invalid_json' });
    }
  });

  req.on('error', () => resolve({ error: 'read_error' }));
});

export function resolveAgentDetailsPath(agentId, agentsDir = AGENTS_DIR) {
  if (!AGENT_ID_RE.test(String(agentId || ''))) {
    throw new Error('Invalid agent ID');
  }
  const baseDir = resolve(agentsDir);
  const agentPath = resolve(baseDir, `${agentId}.md`);
  // Robust path traversal protection: check if resolved path is within baseDir
  const relativePath = relative(baseDir, agentPath);
  const inBase = relativePath && !relativePath.startsWith('..') && !relativePath.startsWith(sep);
  if (!inBase) {
    throw new Error('Invalid agent path');
  }
  return agentPath;
}

function contentTypeForPath(pathname) {
  if (pathname.endsWith('.html')) return 'text/html; charset=utf-8';
  if (pathname.endsWith('.js')) return 'application/javascript; charset=utf-8';
  if (pathname.endsWith('.css')) return 'text/css; charset=utf-8';
  if (pathname.endsWith('.json') || pathname.endsWith('.webmanifest')) return 'application/json; charset=utf-8';
  if (pathname.endsWith('.svg')) return 'image/svg+xml';
  if (pathname.endsWith('.png')) return 'image/png';
  if (pathname.endsWith('.jpg') || pathname.endsWith('.jpeg')) return 'image/jpeg';
  if (pathname.endsWith('.ico')) return 'image/x-icon';
  return 'application/octet-stream';
}

function safeResolveStaticFile(staticDir, pathname) {
  const baseDir = resolve(staticDir);
  const normalized = pathname.replace(/^\/+/, '') || 'index.html';
  const candidate = resolve(baseDir, normalized);
  const relPath = relative(baseDir, candidate);
  if (relPath.startsWith('..') || relPath.startsWith(sep)) return null;
  return candidate;
}

export const createRouter = (buildHtmlFn, token, options = {}) => async (req, res) => {
  const staticDir = options.staticDir ? resolve(options.staticDir) : null;
  const getEvalStoreForRequest = async () => options.evalStore || await getDashboardEvalStore();
  const analyticsSummaryLoader = typeof options.analyticsSummaryLoader === 'function'
    ? options.analyticsSummaryLoader
    : async () => buildAnalyticsSummary({
      dataDir: DATA_DIR,
      evalStore: await getEvalStoreForRequest(),
    });
  const routingExplainabilityLoader = typeof options.routingExplainabilityLoader === 'function'
    ? options.routingExplainabilityLoader
    : async ({ last, sinceDays } = {}) => buildRoutingExplainability({
      dataDir: DATA_DIR,
      evalStore: await getEvalStoreForRequest(),
      last,
      sinceDays,
    });
  const providerExtensibilityLoader = typeof options.providerExtensibilityLoader === 'function'
    ? options.providerExtensibilityLoader
    : async () => listProviderExtensibilityInventory();
  const runtimeFallbacksLoader = typeof options.runtimeFallbacksLoader === 'function'
    ? options.runtimeFallbacksLoader
    : async () => buildRuntimeFallbackInventory({
      shellSummary: createShellSummary(getStateSnapshot()),
      providerExtensibility: listProviderExtensibilityInventory(),
    });
  const providerRecoveryLoader = typeof options.providerRecoveryLoader === 'function'
    ? options.providerRecoveryLoader
    : async () => buildProviderRecoveryInventory({
      shellSummary: createShellSummary(getStateSnapshot()),
      providerExtensibility: listProviderExtensibilityInventory(),
      runtimeFallbacks: await runtimeFallbacksLoader(),
    });
  const runtimeResilienceLoader = typeof options.runtimeResilienceLoader === 'function'
    ? options.runtimeResilienceLoader
    : async () => buildResilienceAuditInventory({
      shellSummary: createShellSummary(getStateSnapshot()),
      providerRecovery: await providerRecoveryLoader(),
      runtimeFallbacks: await runtimeFallbacksLoader(),
    });
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const serve = (status, type, data, extraHeaders = {}) => {
    const headers = {
      ...SECURE_HEADERS,
      'Content-Type': type,
      ...extraHeaders
    };
    if (type.startsWith('text/html')) {
      headers['Content-Security-Policy'] = APP_CSP;
    }
    res.writeHead(status, headers);
    if (Buffer.isBuffer(data)) {
      res.end(data);
      return;
    }
    res.end(typeof data === 'string' ? data : JSON.stringify(data));
  };

  const isApiPath = url.pathname.startsWith('/api/');
  const isProtectedGetPath = (
    url.pathname === '/state' ||
    url.pathname === '/api/state' ||
    url.pathname === '/events' ||
    url.pathname === '/storage-health' ||
    url.pathname.startsWith('/api/kb/') ||
    url.pathname.startsWith('/api/routing/') ||
    url.pathname.startsWith('/api/dev-pipeline/') ||
    url.pathname.startsWith('/api/terminal/') ||
    url.pathname.startsWith('/api/claims/')
  );

  if (req.method === 'GET' && (isApiPath || isProtectedGetPath)) {
    if (!isAuthorized(req, url, token)) {
      return serve(401, 'application/json', {
        error: 'Unauthorized. Provide Authorization: Bearer <token> or ?token=<token>'
      });
    }
  }

  const isInternalPath = (
    isApiPath ||
    url.pathname === '/events' ||
    url.pathname === '/state' ||
    url.pathname === '/storage-health' ||
    url.pathname === '/health'
  );

  if (req.method === 'GET' && staticDir && !isInternalPath) {
    const filePath = safeResolveStaticFile(staticDir, url.pathname);
    if (filePath && existsSync(filePath)) {
      if (filePath.endsWith('index.html')) {
        const expectedToken = getExpectedToken(token);
        let html = readFileSync(filePath, 'utf8');
        html = html.replace('</head>', `<script>window.__CTX_TOKEN__="${expectedToken}";</script>\n</head>`);
        return serve(200, 'text/html; charset=utf-8', html);
      }
      const asBuffer = !filePath.endsWith('.html');
      const data = asBuffer ? readFileSync(filePath) : readFileSync(filePath, 'utf8');
      return serve(200, contentTypeForPath(filePath), data);
    }
    const indexPath = resolve(staticDir, 'index.html');
    if (existsSync(indexPath)) {
      // Inject auth token so the SPA can authenticate API calls
      const expectedToken = getExpectedToken(token);
      let html = readFileSync(indexPath, 'utf8');
      html = html.replace('</head>', `<script>window.__CTX_TOKEN__="${expectedToken}";</script>\n</head>`);
      return serve(200, 'text/html; charset=utf-8', html);
    }
  }

  if (req.method === 'POST') {
    // Auth: require Bearer token for POST /api/*
    if (url.pathname.startsWith('/api/')) {
      if (!isAuthorized(req, url, token)) {
        return serve(401, 'application/json', {
          error: 'Unauthorized. Provide Authorization: Bearer <token> or ?token=<token>'
        });
      }
      // Origin check: allow only localhost
      const origin = req.headers['origin'] || '';
      if (origin && !ALLOWED_ORIGINS.some(o => origin.startsWith(o))) {
        return serve(403, 'application/json', { error: 'Forbidden origin' });
      }
      // Rate limit
      const clientIp = getClientIp(req);
      if (!checkRateLimit(clientIp)) {
        return serve(429, 'application/json', { error: 'Too many requests. Max 30 per minute.' });
      }
    }

    const parsed = await parseBody(req);
    if (parsed.error === 'payload_too_large') {
      return serve(413, 'application/json', { error: 'Payload too large' });
    }
    if (parsed.error === 'invalid_json') {
      return serve(400, 'application/json', { error: 'Invalid JSON body' });
    }
    if (parsed.error) {
      return serve(400, 'application/json', { error: 'Failed to read request body' });
    }

    const body = parsed.body;
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
          const agentPath = resolveAgentDetailsPath(body.id);
          if (!existsSync(agentPath)) throw new Error('Agent not found');
          const content = readFileSync(agentPath, 'utf8');
          return serve(200, 'application/json', { content });
        case '/api/claims/graph': {
          if (!body) throw new Error('body is required');
          setClaimGraph(body);
          return serve(200, 'application/json', { ok: true });
        }
        case '/api/claims/verdict': {
          if (!state.claimGraph) throw new Error('No claim graph available');
          const claimId = String(body?.claimId || '');
          const verdict = body?.verdict;
          if (!claimId) throw new Error('claimId is required');
          if (!state.claimGraph.userVerdicts) state.claimGraph.userVerdicts = {};
          if (verdict === null || verdict === undefined) {
            delete state.claimGraph.userVerdicts[claimId];
          } else {
            state.claimGraph.userVerdicts[claimId] = verdict;
          }
          // Re-run synthesis with modified graph if smart synthesis module available
          try {
            const { buildSmartSynthesisPrompt } = await import('../../scripts/consilium/smart-synthesis.js');
            // Build a modified graph: verdict=true → consensus, verdict=false → removed
            const modifiedGraph = { ...state.claimGraph };
            const verdicts = modifiedGraph.userVerdicts || {};
            const origContested = modifiedGraph.contested || [];
            const movedToConsensus = [];
            const remaining = [];
            for (const c of origContested) {
              if (verdicts[c.id] === 'true') {
                movedToConsensus.push({ id: c.id, text: c.text, type: c.type, supportedBy: ['User'] });
              } else if (verdicts[c.id] === 'false') {
                // excluded from synthesis
              } else {
                remaining.push(c);
              }
            }
            modifiedGraph.consensus = [...(modifiedGraph.consensus || []), ...movedToConsensus];
            modifiedGraph.contested = remaining;
            modifiedGraph.stats = {
              ...modifiedGraph.stats,
              consensus_count: modifiedGraph.consensus.length,
              contested_count: modifiedGraph.contested.length,
            };
          } catch {
            // smart-synthesis module optional — just store verdicts
          }
          broadcast('full', getStateSnapshot());
          return serve(200, 'application/json', { ok: true });
        }
        case '/api/consilium/activate':
          actions.activatePreset(body?.preset);
          refreshAllData();
          return serve(200, 'application/json', { ok: true });
        case '/api/pipeline/plan':
          actions.setPlanSelected(body?.selected);
          refreshAllData();
          return serve(200, 'application/json', { ok: true });
        case '/api/kb/save': {
          const runtime = await getKnowledgeRuntime();
          if (!runtime?.store) {
            return serve(503, 'application/json', {
              error: runtime?.error || 'Knowledge store unavailable',
              mode: runtime?.mode || 'disabled'
            });
          }

          const entry = normalizeKbEntry(body);
          const result = runtime.store.saveEntry(entry);
          if (result.saved) {
            broadcast('kb-update', {
              project: entry.project,
              category: entry.category,
              title: entry.title,
              hash: result.hash
            });
          }

          return serve(200, 'application/json', {
            ok: true,
            mode: runtime.mode,
            result
          });
        }
        case '/api/dev-pipeline/run': {
          if (!body?.specs || !Array.isArray(body.specs) || body.specs.length === 0) {
            throw new Error('specs[] is required');
          }
          const pipeResult = await runDevelopmentPipeline(body.specs, {
            baseBranch: body.baseBranch,
            testCommand: body.testCommand,
            testTimeout: body.testTimeout,
            stopOnTestFail: body.stopOnTestFail,
            conflictResolution: body.conflictResolution,
            conflictProvider: body.conflictProvider,
          });
          return serve(200, 'application/json', pipeResult);
        }
        case '/api/kb/sync': {
          const sync = getKbSyncClient();
          const action = String(body?.action || 'pull').toLowerCase();
          const ensure = await sync.ensureRepo();
          let result;

          if (action === 'push') {
            result = await sync.push(String(body?.message || 'kb: update'));
          } else if (action === 'pull') {
            result = await sync.pull();
          } else if (action === 'status') {
            result = { status: (await sync.isClean()) ? 'clean' : 'dirty' };
          } else {
            throw new Error('action must be one of: pull, push, status');
          }

          return serve(200, 'application/json', {
            ok: true,
            ensure,
            result
          });
        }
        case '/api/routing/feedback': {
          const evalStore = await getEvalStoreForRequest();
          if (!evalStore) {
            return serve(503, 'application/json', { error: 'Eval store unavailable' });
          }
          const payload = parseRoutingFeedbackPayload(body || {});
          const result = evalStore.addRoutingFeedback({
            decision_id: payload.decisionId,
            selected_provider: payload.provider,
            task_type: payload.taskType,
            verdict: payload.verdict,
            note: payload.note || null,
            actor: payload.actor || 'dashboard',
          });
          if (!result.ok) {
            const status = /not found/i.test(result.error || '') ? 404 : 400;
            return serve(status, 'application/json', { error: result.error || 'Failed to persist routing feedback' });
          }
          return serve(200, 'application/json', {
            ok: true,
            record: createRoutingFeedbackRecord({
              id: result.record.id,
              decisionId: result.record.decision_id,
              provider: result.record.selected_provider,
              taskType: result.record.task_type,
              verdict: result.record.verdict,
              note: result.record.note,
              actor: result.record.actor,
              createdAt: result.record.timestamp,
            })
          });
        }
        // Terminal session management
        case '/api/terminal/session/create': {
          const { provider, model, task, label, branch, cwd } = body || {};
          if (!provider) throw new Error('provider is required');
          const sessionId = termSessions.createSession({
            provider: String(provider),
            model: String(model || ''),
            task: String(task || ''),
            label: String(label || ''),
            branch: String(branch || ''),
            cwd: String(cwd || process.cwd())
          });
          return serve(200, 'application/json', { ok: true, sessionId });
        }
        case '/api/terminal/session/kill': {
          const sid = String(body?.sessionId || '');
          if (!sid) throw new Error('sessionId is required');
          const ok = termSessions.killSession(sid, 'user request');
          return serve(200, 'application/json', { ok });
        }
        case '/api/terminal/session/delete': {
          const sid = String(body?.sessionId || '');
          if (!sid) throw new Error('sessionId is required');
          const ok = termSessions.deleteSession(sid);
          return serve(200, 'application/json', { ok });
        }
        case '/api/terminal/session/input': {
          const sid = String(body?.sessionId || '');
          const text = String(body?.text || '');
          if (!sid) throw new Error('sessionId is required');
          if (!text) throw new Error('text is required');
          termSessions.sendInput(sid, text);
          return serve(200, 'application/json', { ok: true });
        }
        default:
          // Dynamic path: /api/terminal/session/:id/input  (POST)
          if (url.pathname.startsWith('/api/terminal/session/') && url.pathname.endsWith('/input')) {
            const sid = url.pathname.slice('/api/terminal/session/'.length, -'/input'.length);
            const text = String(body?.text || '');
            if (!sid) throw new Error('sessionId is required in path');
            if (!text) throw new Error('text is required');
            termSessions.sendInput(sid, text);
            return serve(200, 'application/json', { ok: true });
          }
          return serve(404, 'application/json', { error: 'Not Found' });
      }
    } catch (err) {
      return serve(400, 'application/json', { error: err.message });
    }
  }

  switch (url.pathname) {
    case '/': return serve(200, 'text/html', buildHtmlFn(getExpectedToken(token)));
    case '/events': return sseConnect(req, res, getStateSnapshot, url);
    case '/api/state':
    case '/state': return serve(200, 'application/json', getStateSnapshot());
    case '/api/shell/summary':
      return serve(200, 'application/json', { summary: createShellSummary(getStateSnapshot()) });
    case '/api/providers/extensibility':
      return serve(200, 'application/json', { inventory: await providerExtensibilityLoader() });
    case '/api/providers/recovery':
      return serve(200, 'application/json', { inventory: await providerRecoveryLoader() });
    case '/api/runtime/resilience':
      return serve(200, 'application/json', { inventory: await runtimeResilienceLoader() });
    case '/api/runtime/fallbacks':
      return serve(200, 'application/json', { inventory: await runtimeFallbacksLoader() });
    case '/api/consilium/observability':
      return serve(200, 'application/json', { observability: state.consiliumObservability || null });
    case '/api/consilium/replay': {
      const evalStore = await getEvalStoreForRequest();
      if (!evalStore) {
        return serve(503, 'application/json', { error: 'Eval store unavailable' });
      }

      const last = parsePositiveInt(url.searchParams.get('last'), 8, 1, 50);
      const project = String(url.searchParams.get('project') || '').trim() || null;
      const provider = parseConsiliumProvider(url.searchParams.get('provider'));
      const consensus = parseConsiliumConsensus(url.searchParams.get('consensus'));
      const requestedRunId = String(url.searchParams.get('run_id') || '').trim() || null;
      const sourceDecisions = typeof evalStore.getConsiliumRuns === 'function'
        ? evalStore.getConsiliumRuns({ last: Math.max(last * 5, 50) })
        : [];
      const decisions = filterConsiliumRuns(sourceDecisions, { project, provider, consensus }).slice(0, last);
      const selectedRunId = requestedRunId && decisions.some((decision) => decision.run_id === requestedRunId)
        ? requestedRunId
        : decisions[0]?.run_id || null;
      const detail = selectedRunId && typeof evalStore.getConsiliumRunDetail === 'function'
        ? evalStore.getConsiliumRunDetail(selectedRunId)
        : null;

      if (requestedRunId && !detail?.run) {
        return serve(404, 'application/json', { error: `Consilium run "${requestedRunId}" not found` });
      }

      if (detail?.run && !runMatchesConsiliumFilters(detail.run, { project, provider, consensus })) {
        return serve(404, 'application/json', {
          error: `Consilium run "${selectedRunId}" does not match the requested replay filters`,
        });
      }

      const archive = buildConsiliumReplayArchive({
        decisions,
        allDecisions: sourceDecisions,
        detail,
        knowledgeContext: await buildReplayKnowledgeContext(detail),
        selectedRunId,
        filters: { project, provider, consensus },
      });

      return serve(200, 'application/json', { archive });
    }
    case '/api/consilium/replay/export': {
      const evalStore = await getEvalStoreForRequest();
      if (!evalStore) {
        return serve(503, 'application/json', { error: 'Eval store unavailable' });
      }

      const runId = String(url.searchParams.get('run_id') || '').trim();
      if (!runId) {
        return serve(400, 'application/json', { error: 'run_id is required' });
      }

      const format = String(url.searchParams.get('format') || 'markdown').trim().toLowerCase();
      const project = String(url.searchParams.get('project') || '').trim() || null;
      const provider = parseConsiliumProvider(url.searchParams.get('provider'));
      const consensus = parseConsiliumConsensus(url.searchParams.get('consensus'));
      const detail = typeof evalStore.getConsiliumRunDetail === 'function'
        ? evalStore.getConsiliumRunDetail(runId)
        : null;

      if (!detail?.run) {
        return serve(404, 'application/json', { error: `Consilium run "${runId}" not found` });
      }

      if (!runMatchesConsiliumFilters(detail.run, { project, provider, consensus })) {
        return serve(404, 'application/json', {
          error: `Consilium run "${runId}" does not match the requested replay filters`,
        });
      }

      const archive = buildConsiliumReplayArchive({
        decisions: [detail.run],
        allDecisions: [detail.run],
        detail,
        knowledgeContext: await buildReplayKnowledgeContext(detail),
        selectedRunId: runId,
        filters: { project, provider, consensus },
      });
      const exportArtifact = buildConsiliumReplayExport(archive.replay, { format });
      return serve(200, 'application/json', { export: exportArtifact });
    }
    case '/storage-health': return serve(200, 'application/json', state.storageHealth || {});
    case '/health': return serve(200, 'text/plain', 'OK');
    default:
      if (url.pathname === '/api/kb/search') {
        const runtime = await getKnowledgeRuntime();
        if (!runtime?.store) {
          return serve(503, 'application/json', {
            error: runtime?.error || 'Knowledge store unavailable',
            mode: runtime?.mode || 'disabled'
          });
        }

        const q = String(url.searchParams.get('q') || '').trim();
        if (!q) return serve(400, 'application/json', { error: 'q is required' });
        const limit = parsePositiveInt(url.searchParams.get('limit'), 10, 1, 50);
        const project = String(url.searchParams.get('project') || '').trim() || null;
        const entries = runtime.store.searchEntries(q, { limit, project });
        return serve(200, 'application/json', { ok: true, mode: runtime.mode, entries });
      }

      if (url.pathname.startsWith('/api/kb/context/')) {
        const runtime = await getKnowledgeRuntime();
        if (!runtime?.store) {
          return serve(503, 'application/json', {
            error: runtime?.error || 'Knowledge store unavailable',
            mode: runtime?.mode || 'disabled'
          });
        }

        const project = decodeURIComponent(url.pathname.slice('/api/kb/context/'.length)).trim();
        if (!project) return serve(400, 'application/json', { error: 'project is required' });
        const limit = parsePositiveInt(url.searchParams.get('limit'), 5, 1, 50);
        const context = runtime.store.getContextForProject(project, limit);
        return serve(200, 'application/json', { ok: true, mode: runtime.mode, project, ...context });
      }

      if (url.pathname.startsWith('/api/kb/continuity/')) {
        const runtime = await getKnowledgeRuntime();
        if (!runtime?.store || typeof runtime.store.getContinuityDigest !== 'function') {
          return serve(503, 'application/json', {
            error: runtime?.error || 'Knowledge continuity unavailable',
            mode: runtime?.mode || 'disabled'
          });
        }

        const project = decodeURIComponent(url.pathname.slice('/api/kb/continuity/'.length)).trim();
        if (!project) return serve(400, 'application/json', { error: 'project is required' });
        const limit = parsePositiveInt(url.searchParams.get('limit'), 5, 1, 20);
        const digest = runtime.store.getContinuityDigest(project, limit);
        return serve(200, 'application/json', { ok: true, mode: runtime.mode, project, digest });
      }

      if (url.pathname === '/api/kb/quality') {
        const runtime = await getKnowledgeRuntime();
        if (!runtime?.store || typeof runtime.store.getQualityInsights !== 'function') {
          return serve(503, 'application/json', {
            error: runtime?.error || 'Knowledge quality insights unavailable',
            mode: runtime?.mode || 'disabled'
          });
        }

        const staleAfterDays = parsePositiveInt(url.searchParams.get('stale_days'), 30, 1, 365);
        const summary = runtime.store.getQualityInsights(staleAfterDays);
        return serve(200, 'application/json', { ok: true, mode: runtime.mode, summary });
      }

      if (url.pathname.startsWith('/api/kb/export/')) {
        const runtime = await getKnowledgeRuntime();
        if (!runtime?.store || typeof runtime.store.exportProjectArchive !== 'function') {
          return serve(503, 'application/json', {
            error: runtime?.error || 'Knowledge export unavailable',
            mode: runtime?.mode || 'disabled'
          });
        }

        const project = decodeURIComponent(url.pathname.slice('/api/kb/export/'.length)).trim();
        if (!project) return serve(400, 'application/json', { error: 'project is required' });
        const limit = parsePositiveInt(url.searchParams.get('limit'), 5, 1, 20);
        const staleAfterDays = parsePositiveInt(url.searchParams.get('stale_days'), 30, 1, 365);
        const artifact = runtime.store.exportProjectArchive(project, { limit, staleAfterDays });
        return serve(200, 'application/json', { ok: true, mode: runtime.mode, project, artifact });
      }

      if (url.pathname.startsWith('/api/kb/suggestions/')) {
        const runtime = await getKnowledgeRuntime();
        if (!runtime?.store || typeof runtime.store.getSuggestionTemplates !== 'function') {
          return serve(503, 'application/json', {
            error: runtime?.error || 'Knowledge suggestions unavailable',
            mode: runtime?.mode || 'disabled'
          });
        }

        const project = decodeURIComponent(url.pathname.slice('/api/kb/suggestions/'.length)).trim();
        if (!project) return serve(400, 'application/json', { error: 'project is required' });
        const limit = parsePositiveInt(url.searchParams.get('limit'), 5, 1, 20);
        const summary = runtime.store.getSuggestionTemplates(project, limit);
        return serve(200, 'application/json', { ok: true, mode: runtime.mode, project, summary });
      }

      if (url.pathname === '/api/routing/health') {
        const evalStore = await getEvalStoreForRequest();
        if (!evalStore) {
          return serve(503, 'application/json', { error: 'Eval store unavailable' });
        }
        const last = parsePositiveInt(url.searchParams.get('last'), 50, 1, 200);
        const sinceDays = parsePositiveInt(url.searchParams.get('since_days'), 1, 1, 30);
        const health = evalStore.getRoutingHealth({ last, sinceDays });
        const { detectAnomalies } = await import('../evaluation/routing-anomaly.js');
        const anomalies = detectAnomalies(health.anomalyStats, health.distribution, health.total);
        return serve(200, 'application/json', {
          ok: true,
          total_decisions: health.total,
          recent_decisions: health.decisions,
          distribution: health.distribution,
          anomalies,
          stats: health.anomalyStats
        });
      }

      if (url.pathname === '/api/routing/explainability') {
        try {
          const last = parsePositiveInt(url.searchParams.get('last'), 20, 1, 200);
          const sinceDays = parsePositiveInt(url.searchParams.get('since_days'), 7, 1, 30);
          const summary = await routingExplainabilityLoader({ last, sinceDays });
          return serve(200, 'application/json', { ok: true, summary });
        } catch (err) {
          return serve(500, 'application/json', {
            error: `Failed to build routing explainability: ${err.message}`
          });
        }
      }

      if (url.pathname === '/api/dev-pipeline/status') {
        const pipeline = createDevelopmentPipeline();
        const pipelineId = url.searchParams.get('pipelineId') || undefined;
        const result = pipeline.getStatus(pipelineId);
        if (pipelineId && !result) {
          return serve(404, 'application/json', { error: `Pipeline "${pipelineId}" not found` });
        }
        return serve(200, 'application/json', result);
      }

      if (url.pathname === '/api/analytics/summary') {
        try {
          const summary = await analyticsSummaryLoader();
          return serve(200, 'application/json', { ok: true, summary });
        } catch (err) {
          return serve(500, 'application/json', {
            error: `Failed to build analytics summary: ${err.message}`
          });
        }
      }

      if (url.pathname === '/api/claims/graph') {
        return serve(200, 'application/json', { ok: true, graph: state.claimGraph || null });
      }

      if (url.pathname === '/api/kb/stats') {
        const runtime = await getKnowledgeRuntime();
        if (!runtime?.store) {
          return serve(503, 'application/json', {
            error: runtime?.error || 'Knowledge store unavailable',
            mode: runtime?.mode || 'disabled'
          });
        }
        return serve(200, 'application/json', {
          ok: true,
          mode: runtime.mode,
          stats: runtime.store.getStats()
        });
      }

      // Terminal sessions: list
      if (url.pathname === '/api/terminal/sessions') {
        return serve(200, 'application/json', { ok: true, sessions: termSessions.listSessions() });
      }

      // Terminal session: get single
      if (url.pathname.startsWith('/api/terminal/session/') && !url.pathname.endsWith('/stream')) {
        const sid = url.pathname.slice('/api/terminal/session/'.length);
        if (sid && !sid.includes('/')) {
          const s = termSessions.getSession(sid);
          if (!s) return serve(404, 'application/json', { error: 'Session not found' });
          return serve(200, 'application/json', s);
        }
      }

      // Terminal session: SSE stream
      if (url.pathname.startsWith('/api/terminal/session/') && url.pathname.endsWith('/stream')) {
        const sid = url.pathname.slice('/api/terminal/session/'.length, -'/stream'.length);
        if (!sid) {
          res.writeHead(400);
          res.end('sessionId required');
          return;
        }

        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
          ...SECURE_HEADERS
        });
        res.write(`retry: 3000\n\n`);

        let unsubscribe;
        try {
          unsubscribe = termSessions.subscribeSession(sid, (line) => {
            try {
              res.write(`data: ${JSON.stringify(line)}\n\n`);
            } catch { /* client disconnected */ }
          });
        } catch (err) {
          res.write(`data: ${JSON.stringify({ ts: new Date().toISOString(), type: 'system', text: `Error: ${err.message}` })}\n\n`);
          res.end();
          return;
        }

        const keepalive = setInterval(() => {
          try { res.write(':keepalive\n\n'); } catch { cleanup(); }
        }, SSE_KEEPALIVE_MS);

        const cleanup = () => {
          clearInterval(keepalive);
          if (unsubscribe) { unsubscribe(); unsubscribe = null; }
        };

        req.on('close', cleanup);
        req.on('error', cleanup);
        return;
      }

      if (url.pathname === '/api/cost/summary') {
        try {
          const summary = getCostSummary();
          return serve(200, 'application/json', {
            ok: true,
            summary
          });
        } catch (err) {
          return serve(500, 'application/json', {
            error: `Failed to get cost summary: ${err.message}`
          });
        }
      }

      if (url.pathname === '/api/cost/by-provider') {
        try {
          const byProvider = getCostsByProvider();
          return serve(200, 'application/json', {
            ok: true,
            providers: byProvider
          });
        } catch (err) {
          return serve(500, 'application/json', {
            error: `Failed to get costs by provider: ${err.message}`
          });
        }
      }

      if (url.pathname === '/api/cost/recommendations') {
        try {
          const recommendations = getRecommendations();
          return serve(200, 'application/json', {
            ok: true,
            recommendations
          });
        } catch (err) {
          return serve(500, 'application/json', {
            error: `Failed to get recommendations: ${err.message}`
          });
        }
      }

      if (url.pathname === '/api/cost/budget') {
        try {
          const config = getBudgetConfig();
          const costs = {
            total: getCostSummary().totalCost || 0,
            byProvider: getCostsByProvider()
          };
          const status = checkAllBudgets(costs);
          return serve(200, 'application/json', {
            ok: true,
            config,
            status
          });
        } catch (err) {
          return serve(500, 'application/json', {
            error: `Failed to get budget status: ${err.message}`
          });
        }
      }

      // Environment health check — project, git, GitHub, providers
      if (url.pathname === '/api/health/environment') {
        try {
          const result = await buildEnvironmentHealth();
          return serve(200, 'application/json', { ok: true, ...result });
        } catch (err) {
          return serve(500, 'application/json', { error: err.message });
        }
      }

      res.writeHead(404);
      res.end('Not Found');
  }
};

// --- Environment health check helpers ---

function execAsync(cmd, args, opts = {}) {
  const escaped = args.map(a => /[\s"']/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  const fullCmd = `${cmd} ${escaped.join(' ')}`;
  return new Promise((resolve) => {
    exec(fullCmd, { timeout: 8000, windowsHide: true, ...opts }, (err, stdout, stderr) => {
      resolve({ ok: !err, stdout: (stdout || '').trim(), stderr: (stderr || '').trim(), code: err?.code || 0 });
    });
  });
}

async function buildEnvironmentHealth() {
  const cwd = process.cwd();

  // Git info
  const [gitBranch, gitRemote, gitStatus, gitUser] = await Promise.all([
    execAsync('git', ['branch', '--show-current'], { cwd }),
    execAsync('git', ['remote', 'get-url', 'origin'], { cwd }),
    execAsync('git', ['status', '--short'], { cwd }),
    execAsync('git', ['config', 'user.name'], { cwd }),
  ]);

  const git = {
    ok: gitBranch.ok,
    branch: gitBranch.stdout || null,
    remote: gitRemote.stdout || null,
    dirty: gitStatus.ok ? gitStatus.stdout.split('\n').filter(Boolean).length : 0,
    user: gitUser.stdout || null,
  };

  // GitHub CLI
  const ghAuth = await execAsync('gh', ['auth', 'status', '--hostname', 'github.com'], { cwd });
  const ghRepo = await execAsync('gh', ['repo', 'view', '--json', 'name,owner,url,defaultBranchRef'], { cwd });

  let ghRepoInfo = null;
  if (ghRepo.ok) {
    try { ghRepoInfo = JSON.parse(ghRepo.stdout); } catch { /* ignore */ }
  }

  const github = {
    authenticated: ghAuth.ok || ghAuth.stderr.includes('Logged in'),
    statusText: ghAuth.ok ? 'connected' : (ghAuth.stderr || 'not authenticated'),
    repo: ghRepoInfo,
  };

  // AI Providers
  const providerChecks = await Promise.all([
    checkProvider('claude', ['claude', '--version']),
    checkProvider('gemini', ['gemini', '--version']),
    checkProvider('codex', ['codex', '--version']),
    checkProvider('opencode', ['opencode', 'version']),
  ]);

  const providers = {};
  for (const p of providerChecks) {
    providers[p.name] = { available: p.available, version: p.version };
  }

  // Project dependencies
  const packageJsonPath = join(cwd, 'package.json');
  let project = { name: basename(cwd), path: cwd, hasPackageJson: false, stack: null, deps: 0 };
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      project.hasPackageJson = true;
      project.name = pkg.name || basename(cwd);
      project.stack = pkg.type === 'module' ? 'ESM' : 'CJS';
      project.deps = Object.keys(pkg.dependencies || {}).length + Object.keys(pkg.devDependencies || {}).length;
    } catch { /* ignore */ }
  }

  const nodeModulesExist = existsSync(join(cwd, 'node_modules'));

  // MCP Hub
  const mcpHubPath = join(cwd, 'scripts', 'ctx-mcp-hub.js');
  const mcpAvailable = existsSync(mcpHubPath);

  // Model discovery
  let models = {};
  try {
    models = await discoverAllModelsAsync();
  } catch { /* ignore */ }

  return {
    project,
    git,
    github,
    providers,
    models,
    dependencies: {
      installed: nodeModulesExist,
      count: project.deps,
    },
    mcp: {
      hubAvailable: mcpAvailable,
    },
  };
}

async function checkProvider(name, cmdArgs) {
  const [cmd, ...args] = cmdArgs;
  const result = await execAsync(cmd, args);
  const versionMatch = (result.stdout + ' ' + result.stderr).match(/\d+\.\d+[\w.-]*/);
  return {
    name,
    available: result.ok || !!versionMatch,
    version: versionMatch ? versionMatch[0] : null,
  };
}
