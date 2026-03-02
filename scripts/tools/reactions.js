/**
 * Reaction domain tools: suggest-only reactions to GitHub events.
 *
 * Tools (5):
 * - ctx_react_ci_failed         — handle CI failure: generate fix → draft PR
 * - ctx_react_changes_requested — handle review: generate draft reply
 * - ctx_react_poll              — poll GitHub for new events
 * - ctx_react_status            — circuit breaker status + reaction history
 * - ctx_react_reset             — reset circuit breaker for event type
 */

import { z } from 'zod';
import {
  handleCiFailed,
  handleChangesRequested,
  pollEvents,
  getReactorStatus,
  resetCircuitBreaker,
} from '../reactions/reactor.js';

export function registerReactionTools(server) {

  server.registerTool(
    'ctx_react_ci_failed',
    {
      description: 'Обработать CI failure: собрать логи → AI-генерация фикса → создать draft PR. Макс 2 попытки на один CI run.',
      inputSchema: z.object({
        repo: z.string().describe('Репозиторий в формате owner/repo'),
        runId: z.union([z.string(), z.number()]).describe('ID CI run из GitHub Actions'),
        headSha: z.string().describe('SHA коммита, вызвавшего failure'),
        prNumber: z.number().optional().describe('Номер связанного PR'),
      }).shape,
    },
    async ({ repo, runId, headSha, prNumber }) => {
      try {
        const result = await handleCiFailed({ repo, runId, headSha, prNumber });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'ctx_react_changes_requested',
    {
      description: 'Обработать review "changes requested": собрать комментарии → AI-генерация черновика ответа. Suggest-only — не публикует.',
      inputSchema: z.object({
        repo: z.string().describe('Репозиторий в формате owner/repo'),
        prNumber: z.number().describe('Номер PR'),
        reviewer: z.string().optional().describe('Логин ревьюера'),
        comments: z.string().optional().describe('Текст комментариев (если уже собран)'),
      }).shape,
    },
    async ({ repo, prNumber, reviewer, comments }) => {
      try {
        const result = await handleChangesRequested({ repo, prNumber, reviewer, comments });
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'ctx_react_poll',
    {
      description: 'Поллинг новых GitHub-событий (CI failures, changes_requested). Дедупликация по eventKey.',
      inputSchema: z.object({
        repo: z.string().describe('Репозиторий в формате owner/repo'),
        since: z.string().optional().describe('ISO дата — фильтр "не старше"'),
        types: z.array(z.enum(['ci_failed', 'changes_requested'])).optional()
          .describe('Типы событий для поллинга (по умолчанию все)'),
      }).shape,
    },
    async ({ repo, since, types }) => {
      try {
        const events = await pollEvents({ repo, since, types });
        return {
          content: [{ type: 'text', text: JSON.stringify({ count: events.length, events }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'ctx_react_status',
    {
      description: 'Статус circuit breaker\'ов и история недавних реакций.',
      inputSchema: z.object({}).shape,
    },
    async () => {
      try {
        const status = getReactorStatus();
        return {
          content: [{ type: 'text', text: JSON.stringify(status, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );

  server.registerTool(
    'ctx_react_reset',
    {
      description: 'Ручной сброс circuit breaker для указанного типа события.',
      inputSchema: z.object({
        eventType: z.enum(['ci_failed', 'changes_requested']).describe('Тип события для сброса'),
      }).shape,
    },
    async ({ eventType }) => {
      try {
        resetCircuitBreaker(eventType);
        return {
          content: [{ type: 'text', text: JSON.stringify({ reset: true, eventType }, null, 2) }],
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
