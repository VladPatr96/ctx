/**
 * Knowledge domain tools: ctx_get_project_map, ctx_search_solutions
 */

import { z } from 'zod';
import { join } from 'node:path';

const LABEL_RE = /^[a-z0-9:_-]{1,64}$/i;

export function registerKnowledgeTools(server, { runCommand, readJson, DATA_DIR, GITHUB_OWNER }) {

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
        await runCommand('node', [join(pluginRoot, 'scripts', 'ctx-indexer.js')]);
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
        query: z.string().min(1).max(300).describe('Поисковый запрос'),
        labels: z.array(z.string().regex(LABEL_RE)).max(10).optional().describe('Фильтр по меткам (lesson, session, consilium)'),
        limit: z.number().int().min(1).max(50).optional().describe('Максимум результатов (по умолчанию 10)')
      }).shape,
    },
    async ({ query, labels, limit }) => {
      const maxResults = limit || 10;
      const cleanLabels = labels && labels.length > 0 ? labels : ['lesson'];
      const args = ['search', 'issues', query];
      for (const label of cleanLabels) {
        args.push('--label', label);
      }
      args.push(
        '--owner',
        GITHUB_OWNER,
        '--json',
        'number,title,body,repository',
        '--limit',
        String(maxResults)
      );
      const result = await runCommand('gh', args);

      return {
        content: [{ type: 'text', text: result.success ? (result.stdout || 'No results found.') : `Search failed: ${result.error}` }]
      };
    }
  );
}
