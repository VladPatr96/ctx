/**
 * Knowledge domain tools: ctx_get_project_map, ctx_search_solutions
 */

import { z } from 'zod';
import { join } from 'node:path';

export function registerKnowledgeTools(server, { exec, readJson, DATA_DIR, GITHUB_OWNER }) {

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
        content: [{ type: 'text', text: result || 'No results found.' }]
      };
    }
  );
}
