/**
 * Orchestrator domain tools: worktree lifecycle for parallel AI agents.
 *
 * Tools (5):
 * - ctx_worktree_create  — create isolated worktree for an agent
 * - ctx_worktree_remove  — remove worktree and optionally delete branch
 * - ctx_worktree_list    — list all worktrees with status
 * - ctx_worktree_status  — detailed status for a single worktree
 * - ctx_worktree_merge   — merge agent branch into base branch
 */

import { z } from 'zod';
import {
  createWorktree,
  removeWorktree,
  listWorktrees,
  getWorktree,
  mergeWorktree
} from '../orchestrator/worktree-manager.js';

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
}
