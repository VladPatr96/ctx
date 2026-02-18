/**
 * CTX Dashboard — Action mutators
 * Pure state mutators for dashboard API endpoints.
 * No HTTP, no SSE — just file I/O.
 */

import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import {
  appendLineLocked,
  readJsonFile,
  withLockSync,
  writeFileAtomic,
  writeJsonAtomic
} from './utils/state-io.js';

const STAGES = ['detect', 'context', 'task', 'brainstorm', 'plan', 'execute', 'done'];
const PROVIDERS = ['claude', 'gemini', 'opencode', 'codex'];
const DATA_DIR = '.data';
const PIPELINE_FILE = join(DATA_DIR, 'pipeline.json');
const LOG_FILE = join(DATA_DIR, 'log.jsonl');
const PIPELINE_LOCK_FILE = join(DATA_DIR, '.pipeline.lock');
const LOG_LOCK_FILE = join(DATA_DIR, '.log.lock');
const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const SKILL_RE = /^[a-zA-Z0-9_:/.-]{1,80}$/;
const MODEL_RE = /^[a-zA-Z0-9_./:-]{1,64}$/;
const PRESET_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const TASK_MAX_LEN = 4000;

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

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadPipeline() {
  return readJsonFile(PIPELINE_FILE, {
    stage: 'detect',
    lead: 'claude',
    task: null,
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
}

function savePipeline(pipeline) {
  ensureDataDir();
  withLockSync(PIPELINE_LOCK_FILE, () => {
    pipeline.updatedAt = new Date().toISOString();
    writeJsonAtomic(PIPELINE_FILE, pipeline);
  });
}

function appendLog(action, message) {
  ensureDataDir();
  const entry = { ts: new Date().toISOString(), action, message };
  appendLineLocked(LOG_FILE, JSON.stringify(entry), LOG_LOCK_FILE);
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
  ensureDataDir();
  withLockSync(LOG_LOCK_FILE, () => {
    writeFileAtomic(LOG_FILE, '');
  });
  appendLog('clear', 'Log cleared');
}
