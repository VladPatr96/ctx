/**
 * Pipeline domain tools: ctx_get_pipeline, ctx_set_stage, ctx_update_pipeline
 *
 * State machine: DETECT → CONTEXT → TASK → BRAINSTORM → PLAN → EXECUTE → DONE
 * State stored in .data/pipeline.json
 */

import { z } from 'zod';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const STAGES = ['detect', 'context', 'task', 'brainstorm', 'plan', 'execute', 'done'];
const DATA_DIR = process.env.CTX_DATA_DIR || join(process.cwd(), '.data');
const PIPELINE_FILE = join(DATA_DIR, 'pipeline.json');

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
  try {
    return JSON.parse(readFileSync(PIPELINE_FILE, 'utf-8'));
  } catch {
    return getDefaultPipeline();
  }
}

function savePipeline(pipeline) {
  pipeline.updatedAt = new Date().toISOString();
  writeFileSync(PIPELINE_FILE, JSON.stringify(pipeline, null, 2));
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
        data: z.record(z.any()).optional().describe('Дополнительные данные для записи при переходе')
      }).shape,
    },
    async ({ stage, data }) => {
      const pipeline = loadPipeline();
      const prevStage = pipeline.stage;
      pipeline.stage = stage;
      if (data) Object.assign(pipeline, data);
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
        patch: z.record(z.any()).describe('Объект с полями для обновления (например { lead: "gemini", task: "..." })')
      }).shape,
    },
    async ({ patch }) => {
      const pipeline = loadPipeline();
      for (const [key, value] of Object.entries(patch)) {
        if (typeof value === 'object' && value !== null && !Array.isArray(value) && typeof pipeline[key] === 'object' && pipeline[key] !== null) {
          pipeline[key] = { ...pipeline[key], ...value };
        } else {
          pipeline[key] = value;
        }
      }
      savePipeline(pipeline);
      return {
        content: [{ type: 'text', text: `Pipeline updated: ${Object.keys(patch).join(', ')}` }]
      };
    }
  );
}
