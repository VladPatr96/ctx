/**
 * CTX Dashboard — Action mutators
 * Pure state mutators for dashboard API endpoints.
 * No HTTP, no SSE — just file I/O.
 */

import { z } from 'zod';
import { createStorageAdapter } from './storage/index.js';

const STAGES = ['detect', 'context', 'task', 'brainstorm', 'plan', 'execute', 'done'];
const PROVIDERS = ['claude', 'gemini', 'opencode', 'codex'];
const DATA_DIR = process.env.CTX_DATA_DIR || '.data';
const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const SKILL_RE = /^[a-zA-Z0-9_:/.-]{1,80}$/;
const MODEL_RE = /^[a-zA-Z0-9_./:-]{1,64}$/;
const PRESET_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const TASK_MAX_LEN = 4000;
const storageAdapter = createStorageAdapter({
  dataDir: DATA_DIR,
  preferred: process.env.CTX_STORAGE,
  sqliteFallbackJson: process.env.CTX_SQLITE_FALLBACK_JSON,
  onWarning: (message) => console.warn(`[storage] ${message}`)
});
const storage = storageAdapter.store;

export const TASK_FULL_SCHEMA = z.object({
  task: z.string().trim().min(1).max(TASK_MAX_LEN),
  lead: z.enum(PROVIDERS).optional(),
  consiliumPreset: z.string().trim().regex(PRESET_RE).max(64).optional(),
  agents: z.array(z.string().regex(ID_RE)).max(30).optional(),
  skills: z.array(z.string().regex(SKILL_RE)).max(40).optional(),
  models: z.record(
    z.string().regex(MODEL_RE),
    z.string().regex(MODEL_RE)
  ).optional()
}).strict();

function getDefaultPipeline() {
  return {
    stage: 'detect',
    lead: 'claude',
    task: null,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function loadPipeline() {
  return storage.readPipeline(getDefaultPipeline());
}

function savePipeline(pipeline) {
  pipeline.updatedAt = new Date().toISOString();
  storage.writePipeline(pipeline);
}

function appendLog(action, message) {
  const entry = { ts: new Date().toISOString(), action, message };
  storage.appendLog(entry);
}

export function setStage(stage) {
  if (!STAGES.includes(stage)) {
    throw new Error(`Invalid stage: "${stage}". Valid: ${STAGES.join(', ')}`);
  }
  const pipeline = loadPipeline();
  const prev = pipeline.stage;
  pipeline.stage = stage;
  savePipeline(pipeline);
  appendLog('stage', `${prev} → ${stage}`);
}

export function setTask(task) {
  const trimmed = typeof task === 'string' ? task.trim() : '';
  if (trimmed.length > TASK_MAX_LEN) throw new Error(`Task is too long (max ${TASK_MAX_LEN} chars)`);
  if (!trimmed) throw new Error('Task must be a non-empty string');
  const pipeline = loadPipeline();
  pipeline.task = trimmed;
  if (['detect', 'context'].includes(pipeline.stage)) {
    const prev = pipeline.stage;
    pipeline.stage = 'task';
    appendLog('stage', `${prev} → task (auto-advance)`);
  }
  savePipeline(pipeline);
  appendLog('task', `Set: ${trimmed}`);
}

export function setTaskFull(body) {
  const parsed = TASK_FULL_SCHEMA.safeParse(body || {});
  if (!parsed.success) {
    throw new Error(`Invalid task payload: ${parsed.error.issues[0]?.message || 'schema validation failed'}`);
  }

  const { task, lead, consiliumPreset, agents, skills, models } = parsed.data;
  const pipeline = loadPipeline();
  pipeline.task = task;
  if (['detect', 'context'].includes(pipeline.stage)) {
    appendLog('stage', `${pipeline.stage} → task (auto-advance)`);
    pipeline.stage = 'task';
  }
  if (lead) pipeline.lead = lead;
  if (consiliumPreset) pipeline.activePreset = consiliumPreset;
  if (agents) pipeline.activeAgents = agents;
  if (skills) pipeline.activeSkills = skills;
  if (models) pipeline.models = models;
  savePipeline(pipeline);
  appendLog('task', `Set: ${task}`);
}

export function setLead(lead) {
  if (!PROVIDERS.includes(lead)) {
    throw new Error(`Invalid lead: "${lead}". Valid: ${PROVIDERS.join(', ')}`);
  }
  const pipeline = loadPipeline();
  const prev = pipeline.lead;
  pipeline.lead = lead;
  savePipeline(pipeline);
  appendLog('lead', `${prev} → ${lead}`);
}

export function resetPipeline() {
  const pipeline = loadPipeline();
  const history = pipeline._history || [];
  history.push({
    stage: pipeline.stage,
    task: pipeline.task,
    lead: pipeline.lead,
    resetAt: new Date().toISOString()
  });
  const reset = {
    stage: 'detect',
    lead: pipeline.lead || 'claude',
    task: null,
    _history: history.slice(-10),
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  savePipeline(reset);
  appendLog('reset', 'Pipeline reset to detect');
}

export function activatePreset(preset) {
  const name = typeof preset === 'string' ? preset.trim() : '';
  if (!name) throw new Error('Preset name must be a non-empty string');
  const pipeline = loadPipeline();
  pipeline.activePreset = name;
  savePipeline(pipeline);
  appendLog('preset', `Activated: ${name}`);
}

export function setPlanSelected(selected) {
  const variantId = typeof selected === 'number' ? selected : parseInt(selected, 10);
  if (!Number.isFinite(variantId)) throw new Error('selected must be a number');
  const pipeline = loadPipeline();
  if (!pipeline.plan) pipeline.plan = {};
  pipeline.plan.selected = variantId;
  savePipeline(pipeline);
  appendLog('plan', `Selected variant ${variantId}`);
}

export function clearLog() {
  storage.clearLog();
  appendLog('clear', 'Log cleared');
}

export function getStorageHealth() {
  const base = {
    mode: storageAdapter.mode || 'json',
    failover: Boolean(storageAdapter.failover),
    shadow: Boolean(storageAdapter.shadow)
  };

  if (typeof storage.getHealthSnapshot === 'function') {
    return {
      ...base,
      ...storage.getHealthSnapshot(),
      ts: new Date().toISOString()
    };
  }

  if (typeof storage.getShadowStats === 'function') {
    return {
      ...base,
      mode: 'json-shadow',
      warningActive: false,
      counters: storage.getShadowStats(),
      ts: new Date().toISOString()
    };
  }

  return {
    ...base,
    warningActive: false,
    ts: new Date().toISOString()
  };
}
