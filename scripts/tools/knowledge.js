/**
 * Knowledge domain tools:
 *   ctx_get_project_map, ctx_search_solutions,
 *   ctx_get_project_context, ctx_save_lesson,
 *   ctx_kb_stats, ctx_kb_bootstrap, ctx_kb_sync
 */

import { z } from 'zod';
import { join } from 'node:path';

const LABEL_RE = /^[a-z0-9:_-]{1,64}$/i;

export function registerKnowledgeTools(server, { runCommand, readJson, DATA_DIR, GITHUB_OWNER, knowledgeStore, kbSync }) {

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
      description: 'Поиск решений в кросс-проектной базе знаний. FTS5 поиск в локальной KB, gh CLI как fallback.',
      inputSchema: z.object({
        query: z.string().min(1).max(300).describe('Поисковый запрос'),
        labels: z.array(z.string().regex(LABEL_RE)).max(10).optional().describe('Фильтр по меткам (для gh CLI fallback)'),
        limit: z.number().int().min(1).max(50).optional().describe('Максимум результатов (по умолчанию 10)'),
        project: z.string().optional().describe('Фильтр по проекту'),
        category: z.enum(['solution', 'decision', 'pattern', 'error', 'session-summary']).optional().describe('Фильтр по категории'),
        dateFrom: z.string().optional().describe('Фильтр по дате создания (ISO 8601, например 2026-01-01)')
      }).shape,
    },
    async ({ query, labels, limit, project, category, dateFrom }) => {
      const maxResults = limit || 10;

      // 1. Try local KB first
      if (knowledgeStore) {
        const results = knowledgeStore.searchEntries(query, { limit: maxResults, project, category, dateFrom });
        if (results.length > 0) {
          return {
            content: [{ type: 'text', text: JSON.stringify({
              source: 'kb-local',
              count: results.length,
              results: results.map(r => ({
                project: r.project,
                category: r.category,
                title: r.title,
                body: r.body.length > 500 ? r.body.slice(0, 500) + '...' : r.body,
                tags: r.tags,
                github_url: r.github_url
              }))
            }, null, 2) }]
          };
        }
      }

      // 2. Fallback to gh CLI (if KB empty or disabled)
      const useGhFallback = !knowledgeStore
        || process.env.CTX_KB_GH_FALLBACK === '1'
        || process.env.CTX_KB_DISABLED === '1';

      if (!useGhFallback) {
        return { content: [{ type: 'text', text: 'No results found in local KB.' }] };
      }

      const cleanLabels = labels && labels.length > 0 ? labels : ['lesson'];
      const args = ['search', 'issues', query];
      for (const label of cleanLabels) {
        args.push('--label', label);
      }
      args.push(
        '--owner', GITHUB_OWNER,
        '--json', 'number,title,body,repository',
        '--limit', String(maxResults)
      );
      const result = await runCommand('gh', args);

      return {
        content: [{ type: 'text', text: result.success ? (result.stdout || 'No results found.') : `Search failed: ${result.error}` }]
      };
    }
  );

  server.registerTool(
    'ctx_get_project_context',
    {
      description: 'Топ записей из KB для проекта + snapshot. Заменяет 5 вызовов gh CLI на старте. ~500 токенов вместо 10K.',
      inputSchema: z.object({
        project: z.string().min(1).describe('Имя проекта'),
        limit: z.number().int().min(1).max(20).optional().describe('Кол-во записей (по умолчанию 5)')
      }).shape,
    },
    async ({ project, limit }) => {
      if (!knowledgeStore) {
        return { content: [{ type: 'text', text: 'KB disabled. Use gh CLI for context.' }] };
      }

      const ctx = knowledgeStore.getContextForProject(project, limit || 5);
      return {
        content: [{ type: 'text', text: JSON.stringify({
          source: 'kb-local',
          project,
          entries_count: ctx.entries.length,
          entries: ctx.entries.map(e => ({
            category: e.category,
            title: e.title,
            body: e.body.length > 300 ? e.body.slice(0, 300) + '...' : e.body,
            tags: e.tags
          })),
          snapshot: ctx.snapshot ? ctx.snapshot.data : null,
          snapshot_date: ctx.snapshot ? ctx.snapshot.created_at : null
        }, null, 2) }]
      };
    }
  );

  server.registerTool(
    'ctx_save_lesson',
    {
      description: 'Сохранить урок/решение в KB с upsert-дедупликацией (обновление при изменении содержимого).',
      inputSchema: z.object({
        project: z.string().min(1).describe('Имя проекта'),
        category: z.enum(['solution', 'decision', 'pattern', 'error', 'session-summary']).describe('Категория'),
        title: z.string().min(1).max(300).describe('Заголовок'),
        body: z.string().min(1).describe('Тело записи'),
        tags: z.string().optional().describe('Теги через запятую'),
        sync_github: z.boolean().optional().describe('Также создать GitHub Issue')
      }).shape,
    },
    async ({ project, category, title, body, tags, sync_github }) => {
      if (!knowledgeStore) {
        return { content: [{ type: 'text', text: 'KB disabled.' }] };
      }

      const result = knowledgeStore.saveEntry({
        project, category, title, body,
        tags: tags || '',
        source: 'manual'
      });

      if (sync_github && result.saved) {
        const ghLabel = category === 'error' ? 'lesson' : category;
        await runCommand('gh', [
          'issue', 'create',
          '-R', `${GITHUB_OWNER}/my_claude_code`,
          '--title', `${category}: ${title}`,
          '-l', ghLabel, '-l', `project:${project}`,
          '--body', body
        ]);
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(result) }]
      };
    }
  );

  server.registerTool(
    'ctx_kb_stats',
    {
      description: 'Статистика Knowledge Base: записи по категориям, проектам, размер.',
      inputSchema: z.object({}).shape,
    },
    async () => {
      if (!knowledgeStore) {
        return { content: [{ type: 'text', text: 'KB disabled.' }] };
      }
      const stats = knowledgeStore.getStats();
      return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
    }
  );

  server.registerTool(
    'ctx_kb_bootstrap',
    {
      description: 'Одноразовый импорт из GitHub Issues в KB. Защита от повторного запуска.',
      inputSchema: z.object({
        force: z.boolean().optional().describe('Пропустить проверку bootstrap_done')
      }).shape,
    },
    async ({ force }) => {
      if (!knowledgeStore) {
        return { content: [{ type: 'text', text: 'KB disabled.' }] };
      }

      if (!force && knowledgeStore.getMeta('bootstrap_done') === 'true') {
        return { content: [{ type: 'text', text: 'Bootstrap already completed. Use force=true to re-import.' }] };
      }

      // Fetch issues from central repo
      const result = await runCommand('gh', [
        'search', 'issues', '',
        '--owner', GITHUB_OWNER,
        '--label', 'lesson',
        '--json', 'number,title,body,labels,repository,url',
        '--limit', '100'
      ]);

      if (!result.success) {
        return { content: [{ type: 'text', text: `Fetch failed: ${result.error}` }] };
      }

      let issues;
      try {
        issues = JSON.parse(result.stdout);
      } catch {
        return { content: [{ type: 'text', text: 'Failed to parse issues JSON.' }] };
      }

      const importResult = knowledgeStore.importFromIssues(issues);
      knowledgeStore.setMeta('bootstrap_done', 'true');
      knowledgeStore.setMeta('bootstrap_date', new Date().toISOString());

      return {
        content: [{ type: 'text', text: JSON.stringify({
          status: 'done',
          fetched: issues.length,
          ...importResult
        }, null, 2) }]
      };
    }
  );

  server.registerTool(
    'ctx_kb_sync',
    {
      description: 'Ручной pull/push KB Git-репо. Авто-вызов при /ctx (pull) и /ctx save (push).',
      inputSchema: z.object({
        action: z.enum(['pull', 'push', 'status', 'ensure']).describe('Действие')
      }).shape,
    },
    async ({ action }) => {
      if (!kbSync) {
        return { content: [{ type: 'text', text: 'KB sync not configured.' }] };
      }

      let result;
      switch (action) {
        case 'ensure':
          result = await kbSync.ensureRepo();
          break;
        case 'pull':
          result = await kbSync.pull();
          break;
        case 'push':
          result = await kbSync.push();
          break;
        case 'status':
          result = { clean: await kbSync.isClean() };
          break;
      }

      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    }
  );
}
