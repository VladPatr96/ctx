/**
 * Session domain tools: ctx_log_action, ctx_log_error, ctx_get_session, ctx_get_tasks
 */

import { z } from 'zod';

export function registerSessionTools(server, { getSession, saveSession }) {

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
      return { content: [{ type: 'text', text: `Action logged: ${action}` }] };
    }
  );

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
      return { content: [{ type: 'text', text: `Error & solution logged: ${error}` }] };
    }
  );

  server.registerTool(
    'ctx_get_session',
    {
      description: 'Получить текущий лог сессии: действия, ошибки, задачи.',
      inputSchema: z.object({}).shape,
    },
    async () => {
      const session = getSession();
      return { content: [{ type: 'text', text: JSON.stringify(session, null, 2) }] };
    }
  );

  server.registerTool(
    'ctx_get_tasks',
    {
      description: 'Получить список задач текущей сессии.',
      inputSchema: z.object({}).shape,
    },
    async () => {
      const session = getSession();
      return { content: [{ type: 'text', text: JSON.stringify(session.tasks || [], null, 2) }] };
    }
  );
}
