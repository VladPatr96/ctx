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

import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStorageAdapter } from './storage/index.js';
import { parseDataPatch } from '../tools/pipeline.js';
import { generateCLICommands, syncRegistry } from '../skills/skill-registry.js';
import { loadSkillCommandHandlerByName } from '../skills/skill-contracts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

// ==================== Skill-based commands ====================

/**
 * Execute skill command dynamically
 */
async function executeSkillCommand(skillName, command, args) {
  const { handler } = await loadSkillCommandHandlerByName(skillName, command);
  return await handler(args, { storage, loadPipeline, savePipeline, appendLog });
}

/**
 * Load skill commands dynamically
 */
function loadSkillCommands() {
  try {
    // Sync registry first
    syncRegistry();
    
    // Generate CLI commands from skills
    const skillCommands = generateCLICommands();
    const commands = {};
    
    for (const [cmdName, cmdInfo] of skillCommands) {
      // Convert command name to function
      commands[cmdName] = async (args) => {
        return await executeSkillCommand(cmdInfo.skill, cmdName, args);
      };
    }
    
    return commands;
  } catch (error) {
    console.error('[cli] Failed to load skill commands:', error.message);
    return {};
  }
}

// ==================== Main ====================

// Load built-in commands
const builtInCommands = {
  get_pipeline: cmdGetPipeline,
  set_stage: cmdSetStage,
  update_pipeline: cmdUpdatePipeline,
  log_action: cmdLogAction,
  log_error: cmdLogError
};

// Load skill-based commands
const skillCommands = loadSkillCommands();

// Merge all commands
const commands = { ...builtInCommands, ...skillCommands };

async function main() {
  const args = process.argv.slice(2);

  // No args → launch interactive mode
  if (args.length === 0) {
    const { default: interactive } = await import('../../scripts/ctx-interactive.js');
    return;
  }

  if (args[0] === '--help' || args[0] === '-h') {
    const skillCmdsList = Object.keys(skillCommands).map(cmd => `  ${cmd.padEnd(40)} (skill)`).join('\n');

    console.log(`
CTX CLI — мульти-провайдерная AI-оркестрация

Команды:
  (без аргументов)                       Интерактивный режим (выбор lead, задача, консилиум)
  init                                   Инициализировать ctx в текущем проекте
  get_pipeline                           Получить состояние pipeline
  set_stage --stage <name> [--data ...]  Перейти на стадию
  update_pipeline --patch <json>         Обновить поля pipeline
  log_action --entry <json>              Записать действие в лог
  log_error --entry <json>               Записать ошибку в лог

Команды из скиллов (${Object.keys(skillCommands).length}):
${skillCmdsList}

Стадии pipeline: detect, context, task, brainstorm, plan, execute, done
`);
    process.exit(0);
  }

  // Handle 'init' subcommand
  if (args[0] === 'init') {
    const { init } = await import('../setup/init.js');
    await init();
    return;
  }

  // Handle 'interactive' subcommand
  if (args[0] === 'interactive' || args[0] === 'i') {
    await import('../../scripts/ctx-interactive.js');
    return;
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
    const result = await cmd(parsedArgs);
    if (result !== undefined) {
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (error) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main().catch(console.error);
