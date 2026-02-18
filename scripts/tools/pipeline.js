/**
 * Pipeline domain tools: ctx_get_pipeline, ctx_set_stage, ctx_update_pipeline
 *
 * State machine: DETECT → CONTEXT → TASK → BRAINSTORM → PLAN → EXECUTE → DONE
 * State stored in .data/pipeline.json
 */

import { z } from 'zod';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { readJsonFile, withLockSync, writeJsonAtomic } from '../utils/state-io.js';

const STAGES = ['detect', 'context', 'task', 'brainstorm', 'plan', 'execute', 'done'];
const PROVIDERS = ['claude', 'gemini', 'opencode', 'codex'];
const ID_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const SKILL_RE = /^[a-zA-Z0-9_:/.-]{1,80}$/;
const MODEL_RE = /^[a-zA-Z0-9_./:-]{1,64}$/;
const PRESET_RE = /^[a-zA-Z0-9_-]{1,64}$/;
const DATA_DIR = process.env.CTX_DATA_DIR || join(process.cwd(), '.data');
const PIPELINE_FILE = join(DATA_DIR, 'pipeline.json');
const PIPELINE_LOCK_FILE = join(DATA_DIR, '.pipeline.lock');

export const PIPELINE_DATA_SCHEMA = z.object({
  lead: z.enum(PROVIDERS).optional(),
  task: z.string().trim().min(1).max(4000).nullable().optional(),
  isNew: z.boolean().optional(),
  context: z.record(z.unknown()).optional(),
  brainstorm: z.record(z.unknown()).optional(),
  plan: z.record(z.unknown()).optional(),
  activePreset: z.string().trim().regex(PRESET_RE).max(64).optional(),
  activeAgents: z.array(z.string().regex(ID_RE)).max(30).optional(),
  activeSkills: z.array(z.string().regex(SKILL_RE)).max(40).optional(),
  models: z.record(z.string().regex(MODEL_RE), z.string().regex(MODEL_RE)).optional()
}).strict();

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function getDefaultPipeline() {
  return {
    stage: 'detect',
    isNew: true,
    lead: 'claude',
    task: null,
    context: { index: null, issues: [], history: [] },
    brainstorm: { messages: [], summary: null },
    plan: { variants: [], selected: null, agents: [] },
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function loadPipeline() {
  return readJsonFile(PIPELINE_FILE, getDefaultPipeline());
}

function savePipeline(pipeline) {
  ensureDataDir();
  withLockSync(PIPELINE_LOCK_FILE, () => {
    pipeline.updatedAt = new Date().toISOString();
    writeJsonAtomic(PIPELINE_FILE, pipeline);
  });
}

export function parseDataPatch(value) {
  const parsed = PIPELINE_DATA_SCHEMA.safeParse(value || {});
  if (!parsed.success) {
    throw new Error(`Invalid pipeline data: ${parsed.error.issues[0]?.message || 'schema validation failed'}`);
  }
  return parsed.data;
}

export function registerPipelineTools(server) {

  server.registerTool(
    'ctx_get_pipeline',
    {
      description: 'Получить текущее состояние pipeline: стадия, ведущий провайдер, задача, контекст, план.',
      inputSchema: z.object({}).shape,
    },
    async () => {
      const pipeline = loadPipeline();
      return { content: [{ type: 'text', text: JSON.stringify(pipeline, null, 2) }] };
    }
  );

  server.registerTool(
    'ctx_set_stage',
    {
      description: 'Перейти на указанную стадию pipeline. Стадии: detect, context, task, brainstorm, plan, execute, done.',
      inputSchema: z.object({
        stage: z.enum(STAGES).describe('Целевая стадия pipeline'),
        data: PIPELINE_DATA_SCHEMA.optional().describe('Дополнительные данные для записи при переходе')
      }).shape,
    },
    async ({ stage, data }) => {
      const pipeline = loadPipeline();
      const prevStage = pipeline.stage;
      pipeline.stage = stage;
      if (data) {
        const safeData = parseDataPatch(data);
        Object.assign(pipeline, safeData);
      }
      savePipeline(pipeline);
      return {
        content: [{ type: 'text', text: `Pipeline: ${prevStage} → ${stage}` }]
      };
    }
  );

  server.registerTool(
    'ctx_update_pipeline',
    {
      description: 'Обновить произвольные поля pipeline (deep merge первого уровня).',
      inputSchema: z.object({
        patch: PIPELINE_DATA_SCHEMA.describe('Объект с полями для обновления (например { lead: "gemini", task: "..." })')
      }).shape,
    },
    async ({ patch }) => {
      const safePatch = parseDataPatch(patch);
      if (Object.keys(safePatch).length === 0) {
        throw new Error('Patch must include at least one allowed field');
      }
      const pipeline = loadPipeline();
      for (const [key, value] of Object.entries(safePatch)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value) && typeof pipeline[key] === 'object' && pipeline[key] !== null) {
          pipeline[key] = { ...pipeline[key], ...value };
        } else {
          pipeline[key] = value;
        }
      }
      savePipeline(pipeline);
      return {
        content: [{ type: 'text', text: `Pipeline updated: ${Object.keys(safePatch).join(', ')}` }]
      };
    }
  );
}
