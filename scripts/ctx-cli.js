#!/usr/bin/env node

/**
 * ctx-cli.js — универсальный CLI wrapper для CTX tools
 * Работает везде: Codex CLI, Claude Code, Gemini CLI, OpenCode
 *
 * Использование:
 *   node ctx-cli.js get_pipeline
 *   node ctx-cli.js set_stage --stage context
 *   node ctx-cli.js update_pipeline --patch '{"lead":"gemini"}'
 *   node ctx-cli.js log_action --action "stage_change"
 */

import { readFile, existsSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { createStorageAdapter } from './storage/index.js';
import { parseDataPatch } from './tools/pipeline.js';

// ==================== Config ====================

const DATA_DIR = process.env.CTX_DATA_DIR || join(process.cwd(), '.data');
const { store: storage } = createStorageAdapter({
  dataDir: DATA_DIR,
  preferred: process.env.CTX_STORAGE,
  sqliteFallbackJson: process.env.CTX_SQLITE_FALLBACK_JSON,
  onWarning: (message) => console.warn(`[storage] ${message}`)
});

// ==================== Pipeline functions ====================

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
  return storage.readPipeline(getDefaultPipeline());
}

function savePipeline(pipeline) {
  pipeline.updatedAt = new Date().toISOString();
  storage.writePipeline(pipeline);
}

// ==================== Logging functions ====================

function appendLog(entry) {
  try {
    const newEntry = { ts: new Date().toISOString(), ...entry };
    storage.appendLog(newEntry);
  } catch (error) {
    console.error(`[log] Failed to append: ${error.message}`);
  }
}

// ==================== CLI handlers ====================

async function cmdGetPipeline() {
  const pipeline = loadPipeline();
  console.log(JSON.stringify(pipeline, null, 2));
}

async function cmdSetStage(args) {
  const stage = args.stage;
  const data = args.data ? JSON.parse(args.data) : undefined;
  
  const pipeline = loadPipeline();
  const prevStage = pipeline.stage;
  pipeline.stage = stage;
  if (data) {
    const safeData = parseDataPatch(data);
    Object.assign(pipeline, safeData);
  }
  savePipeline(pipeline);
  appendLog({ action: 'stage_change', from: prevStage, to: stage });
  console.log(`Pipeline: ${prevStage} → ${stage}`);
}

async function cmdUpdatePipeline(args) {
  const patch = JSON.parse(args.patch);
  const safePatch = parseDataPatch(patch);
  
  if (Object.keys(safePatch).length === 0) {
    throw new Error('Patch must include at least one allowed field');
  }
  
  const pipeline = loadPipeline();
  for (const [key, value] of Object.entries(safePatch)) {
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && 
        typeof pipeline[key] === 'object' && pipeline[key] !== null) {
      pipeline[key] = { ...pipeline[key], ...value };
    } else {
      pipeline[key] = value;
    }
  }
  savePipeline(pipeline);
  appendLog({ action: 'pipeline_update', fields: Object.keys(safePatch) });
  console.log(`Pipeline updated: ${Object.keys(safePatch).join(', ')}`);
}

async function cmdLogAction(args) {
  const entry = JSON.parse(args.entry);
  appendLog(entry);
  console.log('Action logged');
}

async function cmdLogError(args) {
  const entry = JSON.parse(args.entry);
  appendLog({ type: 'error', ...entry });
  console.log('Error logged');
}

// ==================== Main ====================

const commands = {
  get_pipeline: cmdGetPipeline,
  set_stage: cmdSetStage,
  update_pipeline: cmdUpdatePipeline,
  log_action: cmdLogAction,
  log_error: cmdLogError
};

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
CTX CLI — универсальный интерфейс для CTX tools

Команды:
  get_pipeline                           Получить состояние pipeline
  set_stage --stage <name> [--data ...]  Перейти на стадию
  update_pipeline --patch <json>         Обновить поля pipeline
  log_action --entry <json>              Записать действие в лог
  log_error --entry <json>               Записать ошибку в лог

Стадии pipeline: detect, context, task, brainstorm, plan, execute, done
`);
    process.exit(0);
  }
  
  const [cmdName, ...cmdArgs] = args;
  const cmd = commands[cmdName];
  
  if (!cmd) {
    console.error(`Unknown command: ${cmdName}`);
    console.error('Available:', Object.keys(commands).join(', '));
    process.exit(1);
  }
  
  const parsedArgs = {};
  for (let i = 0; i < cmdArgs.length; i += 2) {
    const key = cmdArgs[i].replace(/^--/, '');
    parsedArgs[key] = cmdArgs[i + 1];
  }
  
  try {
    await cmd(parsedArgs);
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
