/**
 * CTX Dashboard — Action mutators
 * Pure state mutators for dashboard API endpoints.
 * No HTTP, no SSE — just file I/O.
 */

import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const STAGES = ['detect', 'context', 'task', 'brainstorm', 'plan', 'execute', 'done'];
const PROVIDERS = ['claude', 'gemini', 'opencode', 'codex'];
const DATA_DIR = '.data';
const PIPELINE_FILE = join(DATA_DIR, 'pipeline.json');
const LOG_FILE = join(DATA_DIR, 'log.jsonl');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadPipeline() {
  try {
    return JSON.parse(readFileSync(PIPELINE_FILE, 'utf-8'));
  } catch {
    return {
      stage: 'detect',
      lead: 'claude',
      task: null,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
  }
}

function savePipeline(pipeline) {
  ensureDataDir();
  pipeline.updatedAt = new Date().toISOString();
  writeFileSync(PIPELINE_FILE, JSON.stringify(pipeline, null, 2));
}

function appendLog(action, message) {
  ensureDataDir();
  const entry = { ts: new Date().toISOString(), action, message };
  appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
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
  const task = typeof body?.task === 'string' ? body.task.trim() : '';
  if (!task) throw new Error('Task must be a non-empty string');
  const pipeline = loadPipeline();
  pipeline.task = task;
  if (['detect', 'context'].includes(pipeline.stage)) {
    appendLog('stage', `${pipeline.stage} → task (auto-advance)`);
    pipeline.stage = 'task';
  }
  if (PROVIDERS.includes(body?.lead))              pipeline.lead = body.lead;
  if (typeof body?.consiliumPreset === 'string')   pipeline.activePreset = body.consiliumPreset.trim();
  if (Array.isArray(body?.agents))                 pipeline.activeAgents = body.agents.filter(a => typeof a === 'string');
  if (Array.isArray(body?.skills))                 pipeline.activeSkills = body.skills.filter(s => typeof s === 'string');
  if (body?.models && typeof body.models === 'object') pipeline.models = body.models;
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

export function clearLog() {
  ensureDataDir();
  writeFileSync(LOG_FILE, '');
  appendLog('clear', 'Log cleared');
}
