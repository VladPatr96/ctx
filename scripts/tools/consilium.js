/**
 * Consilium domain tools: ctx_share_result, ctx_read_results
 */

import { z } from 'zod';

export function registerConsiliumTools(server, { getResults, saveResults }) {

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
      return { content: [{ type: 'text', text: `Result shared by ${provider}` }] };
    }
  );

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
}
