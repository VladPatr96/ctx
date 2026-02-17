#!/usr/bin/env node

/**
 * ctx-mcp-hub.js
 *
 * MCP Hub — межпровайдерный сервер контекста.
 * Предоставляет общие инструменты для Claude Code, Gemini CLI, OpenCode.
 *
 * Tools:
 * - ctx_get_project_map — полная карта проекта
 * - ctx_search_solutions — поиск решений в GitHub Issues
 * - ctx_log_action — записать действие в лог сессии
 * - ctx_log_error — записать ошибку и решение
 * - ctx_get_session — текущий лог сессии
 * - ctx_share_result — опубликовать результат для других агентов
 * - ctx_read_results — прочитать результаты других агентов
 * - ctx_get_tasks — получить список задач
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, basename } from 'node:path';

const DATA_DIR = process.env.CTX_DATA_DIR || join(process.cwd(), '.data');
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'VladPatr96';
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();

// Ensure data dir exists
if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });

function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', cwd: PROJECT_DIR, timeout: 15000 }).trim();
  } catch {
    return '';
  }
}

function readJson(file) {
  try {
    return JSON.parse(readFileSync(file, 'utf-8'));
  } catch {
    return null;
  }
}

function writeJson(file, data) {
  writeFileSync(file, JSON.stringify(data, null, 2));
}

// Session state
const sessionFile = join(DATA_DIR, 'session.json');
const resultsFile = join(DATA_DIR, 'results.json');

function getSession() {
  return readJson(sessionFile) || {
    startedAt: new Date().toISOString(),
    project: basename(PROJECT_DIR),
    actions: [],
    errors: [],
    tasks: []
  };
}

function saveSession(session) {
  writeJson(sessionFile, session);
}

function getResults() {
  return readJson(resultsFile) || [];
}

function saveResults(results) {
  writeJson(resultsFile, results);
}

// ==================== MCP Server ====================

const server = new McpServer({
  name: 'ctx-hub',
  version: '0.1.0',
});

// --- Tool: ctx_get_project_map ---
server.registerTool(
  'ctx_get_project_map',
  {
    description: 'Получить полную карту проекта: стек, структура, i18n, git, паттерны. Запускает индексацию если индекс устарел.',
    inputSchema: z.object({
      forceReindex: z.boolean().optional().describe('Принудительно переиндексировать')
    }).shape,
  },
  async ({ forceReindex }) => {
    const indexFile = join(DATA_DIR, 'index.json');
    let index = readJson(indexFile);

    // Reindex if missing, forced, or older than 1 hour
    if (!index || forceReindex || (Date.now() - new Date(index.timestamp).getTime() > 3600000)) {
      const pluginRoot = process.env.CLAUDE_PLUGIN_ROOT || join(DATA_DIR, '..');
      exec(`node "${join(pluginRoot, 'scripts', 'ctx-indexer.js')}"`);
      index = readJson(indexFile);
    }

    return {
      content: [{
        type: 'text',
        text: index ? JSON.stringify(index, null, 2) : 'Index not available. Run ctx-indexer.js manually.'
      }]
    };
  }
);

// --- Tool: ctx_search_solutions ---
server.registerTool(
  'ctx_search_solutions',
  {
    description: 'Поиск решений в кросс-проектной базе знаний (GitHub Issues). Ищет уроки, решения, сессии.',
    inputSchema: z.object({
      query: z.string().describe('Поисковый запрос'),
      labels: z.array(z.string()).optional().describe('Фильтр по меткам (lesson, session, consilium)'),
      limit: z.number().optional().describe('Максимум результатов (по умолчанию 10)')
    }).shape,
  },
  async ({ query, labels, limit }) => {
    const maxResults = limit || 10;
    const labelFilter = labels ? labels.map(l => `label:${l}`).join(' ') : 'label:lesson';

    const cmd = `gh search issues "${query}" ${labelFilter} --owner ${GITHUB_OWNER} --json number,title,body,repository --limit ${maxResults}`;
    const result = exec(cmd);

    return {
      content: [{
        type: 'text',
        text: result || 'No results found.'
      }]
    };
  }
);

// --- Tool: ctx_log_action ---
server.registerTool(
  'ctx_log_action',
  {
    description: 'Записать действие в лог текущей сессии.',
    inputSchema: z.object({
      action: z.string().describe('Описание действия'),
      file: z.string().optional().describe('Файл/компонент'),
      result: z.string().optional().describe('Результат')
    }).shape,
  },
  async ({ action, file, result }) => {
    const session = getSession();
    session.actions.push({
      time: new Date().toISOString(),
      action,
      file: file || null,
      result: result || null
    });
    saveSession(session);

    return {
      content: [{ type: 'text', text: `Action logged: ${action}` }]
    };
  }
);

// --- Tool: ctx_log_error ---
server.registerTool(
  'ctx_log_error',
  {
    description: 'Записать ошибку и её решение. Автоматически сохраняется для будущего поиска.',
    inputSchema: z.object({
      error: z.string().describe('Описание ошибки'),
      solution: z.string().describe('Как исправлено'),
      prevention: z.string().optional().describe('Как предотвратить в будущем')
    }).shape,
  },
  async ({ error, solution, prevention }) => {
    const session = getSession();
    session.errors.push({
      time: new Date().toISOString(),
      error,
      solution,
      prevention: prevention || null
    });
    saveSession(session);

    return {
      content: [{ type: 'text', text: `Error & solution logged: ${error}` }]
    };
  }
);

// --- Tool: ctx_get_session ---
server.registerTool(
  'ctx_get_session',
  {
    description: 'Получить текущий лог сессии: действия, ошибки, задачи.',
    inputSchema: z.object({}).shape,
  },
  async () => {
    const session = getSession();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(session, null, 2)
      }]
    };
  }
);

// --- Tool: ctx_share_result ---
server.registerTool(
  'ctx_share_result',
  {
    description: 'Опубликовать результат работы для других агентов. Используется в consilium для обмена предложениями.',
    inputSchema: z.object({
      provider: z.string().describe('Имя провайдера (claude, gemini, opencode, codex)'),
      task: z.string().describe('Описание задачи'),
      result: z.string().describe('Результат/предложение'),
      confidence: z.number().optional().describe('Уверенность 0-1')
    }).shape,
  },
  async ({ provider, task, result, confidence }) => {
    const results = getResults();
    results.push({
      time: new Date().toISOString(),
      provider,
      task,
      result,
      confidence: confidence || null
    });
    saveResults(results);

    return {
      content: [{ type: 'text', text: `Result shared by ${provider}` }]
    };
  }
);

// --- Tool: ctx_read_results ---
server.registerTool(
  'ctx_read_results',
  {
    description: 'Прочитать результаты других агентов. Используется для синтеза в consilium.',
    inputSchema: z.object({
      task: z.string().optional().describe('Фильтр по задаче'),
      provider: z.string().optional().describe('Фильтр по провайдеру')
    }).shape,
  },
  async ({ task, provider }) => {
    let results = getResults();

    if (task) results = results.filter(r => r.task.includes(task));
    if (provider) results = results.filter(r => r.provider === provider);

    return {
      content: [{
        type: 'text',
        text: results.length > 0 ? JSON.stringify(results, null, 2) : 'No results found.'
      }]
    };
  }
);

// --- Tool: ctx_get_tasks ---
server.registerTool(
  'ctx_get_tasks',
  {
    description: 'Получить список задач текущей сессии.',
    inputSchema: z.object({}).shape,
  },
  async () => {
    const session = getSession();
    return {
      content: [{
        type: 'text',
        text: JSON.stringify(session.tasks || [], null, 2)
      }]
    };
  }
);

// ==================== Start Server ====================

const transport = new StdioServerTransport();
await server.connect(transport);
