/**
 * Orchestrator domain tools: worktree lifecycle for parallel AI agents.
 *
 * Tools (13):
 * - ctx_worktree_create      — create isolated worktree for an agent
 * - ctx_worktree_remove      — remove worktree and optionally delete branch
 * - ctx_worktree_list        — list all worktrees with status
 * - ctx_worktree_status      — detailed status for a single worktree
 * - ctx_worktree_merge       — merge agent branch into base branch
 * - ctx_agent_execute        — run one agent in isolated worktree
 * - ctx_agent_run_parallel   — run multiple agents in parallel with concurrency limit
 * - ctx_agent_status         — query execution status
 * - ctx_dev_pipeline_run     — run development pipeline (parallel execute → merge → test → verify)
 * - ctx_dev_pipeline_status  — query pipeline status or list all pipelines
 * - ctx_terminal_spawn       — spawn agents in visual terminal splits (tmux/wt/wezterm)
 * - ctx_terminal_detect      — detect available terminal multiplexer
 * - ctx_terminal_capture     — capture tmux pane output for monitoring
 */

import { z } from 'zod';
import {
  createWorktree,
  removeWorktree,
  listWorktrees,
  getWorktree,
  mergeWorktree
} from '../orchestrator/worktree-manager.js';
import { executeAgent, getExecutionStatus, listExecutions } from '../orchestrator/executor.js';
import { runParallel } from '../orchestrator/agent-runner.js';
import { runDevelopmentPipeline, createDevelopmentPipeline } from '../orchestrator/development-pipeline.js';
import { spawnAgentSplits, detectTerminal, captureTmuxPane } from '../orchestrator/terminal-spawner.js';

const AGENT_ID = z.string()
  .regex(/^[a-z0-9](?:[a-z0-9-]{0,62})$/)
  .describe('ID агента (kebab-case: строчные буквы, цифры, дефис)');

export function registerOrchestratorTools(server) {

  server.registerTool(
    'ctx_worktree_create',
    {
      description: 'Создать изолированный worktree для агента. Создаёт ветку agent/<agentId> от baseBranch.',
      inputSchema: z.object({
        agentId: AGENT_ID,
        baseBranch: z.string().optional().describe('Базовая ветка (по умолчанию master)'),
        task: z.string().max(4000).optional().describe('Описание задачи агента'),
        provider: z.enum(['claude', 'gemini', 'codex', 'opencode']).optional().describe('AI провайдер')
      }).shape,
    },
    async ({ agentId, baseBranch, task, provider }) => {
      try {
        const result = await createWorktree(agentId, { baseBranch, task, provider });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  server.registerTool(
    'ctx_worktree_remove',
    {
      description: 'Удалить worktree агента. Опционально удаляет ветку.',
      inputSchema: z.object({
        agentId: AGENT_ID,
        deleteBranch: z.boolean().optional().describe('Удалить ветку agent/<agentId> (по умолчанию true)'),
        force: z.boolean().optional().describe('Принудительное удаление (при незакоммиченных изменениях)')
      }).shape,
    },
    async ({ agentId, deleteBranch, force }) => {
      try {
        const result = await removeWorktree(agentId, { deleteBranch, force });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  server.registerTool(
    'ctx_worktree_list',
    {
      description: 'Список всех worktrees с обогащённым статусом (git + state).',
      inputSchema: z.object({}).shape,
    },
    async () => {
      try {
        const result = await listWorktrees();
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  server.registerTool(
    'ctx_worktree_status',
    {
      description: 'Подробный статус worktree агента: HEAD, dirty, ahead/behind.',
      inputSchema: z.object({
        agentId: AGENT_ID
      }).shape,
    },
    async ({ agentId }) => {
      try {
        const result = await getWorktree(agentId);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  server.registerTool(
    'ctx_worktree_merge',
    {
      description: 'Слить ветку агента в базовую ветку (rebase + merge --no-ff). Проверяет чистоту main repo.',
      inputSchema: z.object({
        agentId: AGENT_ID,
        squash: z.boolean().optional().describe('Squash-merge (один коммит)'),
        message: z.string().max(500).optional().describe('Commit message для merge')
      }).shape,
    },
    async ({ agentId, squash, message }) => {
      try {
        const result = await mergeWorktree(agentId, { squash, message });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // ==================== Agent Execution tools ====================

  const PROVIDER = z.enum(['claude', 'gemini', 'codex', 'opencode'])
    .describe('AI CLI провайдер');

  server.registerTool(
    'ctx_agent_execute',
    {
      description: 'Запустить одного агента в изолированном worktree: создание worktree → invoke провайдера → сбор результата → очистка.',
      inputSchema: z.object({
        agentId: AGENT_ID,
        task: z.string().max(4000).describe('Задача/промпт для агента'),
        provider: PROVIDER,
        timeout: z.number().min(5000).max(600000).optional()
          .describe('Таймаут выполнения в мс (по умолчанию 120000)'),
        baseBranch: z.string().optional().describe('Базовая ветка (по умолчанию master)'),
        cleanup: z.boolean().optional().describe('Удалять worktree после завершения (по умолчанию true)')
      }).shape,
    },
    async ({ agentId, task, provider, timeout, baseBranch, cleanup }) => {
      try {
        const result = await executeAgent(agentId, {
          task, provider, timeout, baseBranch, cleanup,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  server.registerTool(
    'ctx_agent_run_parallel',
    {
      description: 'Параллельный запуск нескольких агентов в worktrees с ограничением concurrency. Максимум 6 агентов.',
      inputSchema: z.object({
        specs: z.array(z.object({
          agentId: AGENT_ID,
          task: z.string().max(4000).describe('Задача/промпт'),
          provider: PROVIDER,
          timeout: z.number().min(5000).max(600000).optional()
            .describe('Таймаут для агента в мс'),
        })).min(1).max(6).describe('Список спецификаций агентов'),
        concurrency: z.number().min(1).max(6).optional()
          .describe('Макс. параллельных запусков (по умолчанию 3)'),
        globalTimeout: z.number().min(10000).max(600000).optional()
          .describe('Глобальный таймаут в мс (по умолчанию 300000)'),
        baseBranch: z.string().optional().describe('Базовая ветка'),
        cleanup: z.boolean().optional().describe('Удалять worktrees после завершения'),
      }).shape,
    },
    async ({ specs, concurrency, globalTimeout, baseBranch, cleanup }) => {
      try {
        const result = await runParallel(specs, {
          concurrency, globalTimeout, baseBranch, cleanup,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  server.registerTool(
    'ctx_agent_status',
    {
      description: 'Статус выполнения агентов. По agentId — один агент, без — все, с фильтром по статусу.',
      inputSchema: z.object({
        agentId: AGENT_ID.optional(),
        status: z.enum(['pending', 'running', 'completed', 'failed', 'timeout']).optional()
          .describe('Фильтр по статусу'),
      }).shape,
    },
    async ({ agentId, status }) => {
      try {
        if (agentId) {
          const entry = getExecutionStatus(agentId);
          if (!entry) {
            return {
              content: [{ type: 'text', text: `No execution found for agent "${agentId}"` }],
              isError: true,
            };
          }
          return {
            content: [{ type: 'text', text: JSON.stringify(entry, null, 2) }]
          };
        }
        const entries = listExecutions({ status });
        return {
          content: [{ type: 'text', text: JSON.stringify({ total: entries.length, executions: entries }, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // ==================== Development Pipeline tools ====================

  server.registerTool(
    'ctx_dev_pipeline_run',
    {
      description: 'Запустить development pipeline: параллельное выполнение агентов → risk-aware merge → тесты → верификация. Автоматическое разрешение конфликтов через AI.',
      inputSchema: z.object({
        specs: z.array(z.object({
          agentId: AGENT_ID,
          task: z.string().max(4000).describe('Задача/промпт'),
          provider: PROVIDER,
          priority: z.number().min(0).max(99).optional()
            .describe('Приоритет merge (0 = наивысший, по умолчанию 99)'),
        })).min(1).max(6).describe('Список спецификаций агентов'),
        baseBranch: z.string().optional().describe('Базовая ветка (по умолчанию master)'),
        testCommand: z.union([
          z.string(),
          z.array(z.string()),
        ]).optional().describe('Команда тестов (строка или массив для sequential run)'),
        testTimeout: z.number().min(5000).max(600000).optional()
          .describe('Таймаут тестов в мс (по умолчанию 120000)'),
        stopOnTestFail: z.boolean().optional()
          .describe('Остановить pipeline при провале тестов (по умолчанию false — skip agent)'),
        conflictResolution: z.boolean().optional()
          .describe('AI-разрешение конфликтов (по умолчанию true)'),
        conflictProvider: PROVIDER.optional()
          .describe('Провайдер для разрешения конфликтов (по умолчанию claude)'),
      }).shape,
    },
    async ({ specs, baseBranch, testCommand, testTimeout, stopOnTestFail, conflictResolution, conflictProvider }) => {
      try {
        const result = await runDevelopmentPipeline(specs, {
          baseBranch,
          testCommand,
          testTimeout,
          stopOnTestFail,
          conflictResolution,
          conflictProvider,
        });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  server.registerTool(
    'ctx_dev_pipeline_status',
    {
      description: 'Статус development pipeline. По pipelineId — конкретный pipeline, без — список всех.',
      inputSchema: z.object({
        pipelineId: z.string().optional().describe('ID pipeline (без ID — список всех)'),
      }).shape,
    },
    async ({ pipelineId }) => {
      try {
        const pipeline = createDevelopmentPipeline();
        const result = pipeline.getStatus(pipelineId);
        if (pipelineId && !result) {
          return {
            content: [{ type: 'text', text: `Pipeline "${pipelineId}" not found` }],
            isError: true,
          };
        }
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  // ==================== Terminal Split tools ====================

  server.registerTool(
    'ctx_terminal_spawn',
    {
      description: 'Запустить AI CLI агентов в визуальных сплитах терминала (tmux / Windows Terminal / WezTerm). Каждый агент получает свою панель.',
      inputSchema: z.object({
        agents: z.array(z.object({
          agentId: AGENT_ID,
          provider: PROVIDER,
          task: z.string().max(4000).describe('Задача/промпт для агента'),
          cwd: z.string().optional().describe('Рабочая директория агента'),
        })).min(1).max(6).describe('Список агентов для запуска'),
        terminal: z.enum(['auto', 'tmux', 'wt', 'wezterm']).optional()
          .describe('Терминал (auto = автоопределение)'),
        cwd: z.string().optional()
          .describe('Рабочая директория по умолчанию'),
      }).shape,
    },
    async ({ agents, terminal, cwd }) => {
      try {
        const result = await spawnAgentSplits(agents, { terminal, cwd });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  server.registerTool(
    'ctx_terminal_detect',
    {
      description: 'Определить доступный терминал-мультиплексор (tmux, wt, wezterm).',
      inputSchema: z.object({}).shape,
    },
    async () => {
      try {
        const terminal = await detectTerminal();
        const inTmux = !!process.env.TMUX;
        return {
          content: [{ type: 'text', text: JSON.stringify({
            detected: terminal,
            inTmuxSession: inTmux,
            platform: process.platform,
            available: terminal ? `Use ctx_terminal_spawn with terminal="${terminal}"` : 'No multiplexer found',
          }, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );

  server.registerTool(
    'ctx_terminal_capture',
    {
      description: 'Прочитать вывод панели tmux (для мониторинга агентов).',
      inputSchema: z.object({
        target: z.string().describe('Цель панели: номер (1, 2, 3) или направление ({right}, {bottom})'),
        lines: z.number().min(10).max(500).optional()
          .describe('Количество строк для захвата (по умолчанию 100)'),
      }).shape,
    },
    async ({ target, lines }) => {
      try {
        const output = await captureTmuxPane(target, lines);
        return {
          content: [{ type: 'text', text: output }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true
        };
      }
    }
  );
}
