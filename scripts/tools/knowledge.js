/**
 * Knowledge domain tools:
 *   ctx_get_project_map, ctx_search_solutions,
 *   ctx_get_project_context, ctx_save_lesson,
 *   ctx_kb_stats, ctx_kb_bootstrap, ctx_kb_sync
 */

import { z } from 'zod';
import { join } from 'node:path';

const LABEL_RE = /^[a-z0-9:_-]{1,64}$/i;
const CENTRAL_KB_REPO_NAME = 'my_claude_code';

function mapCategoryToGitHubLabel(category) {
  if (category === 'error') return 'lesson';
  if (category === 'session-summary') return 'session';
  return category;
}

function parseIssueUrl(text) {
  if (typeof text !== 'string') return null;
  const match = text.match(/https:\/\/github\.com\/[^\s]+\/issues\/\d+/);
  return match ? match[0] : null;
}

async function getRepoLabels(runCommand, repo) {
  const res = await runCommand('gh', ['label', 'list', '-R', repo, '--limit', '200', '--json', 'name']);
  if (!res.success) return null;
  try {
    const labels = JSON.parse(res.stdout || '[]');
    return new Set(labels.map(l => l?.name).filter(Boolean));
  } catch {
    return null;
  }
}

async function createIssueWithLabelFallback(runCommand, { repo, title, body, labels }) {
  const requested = [...new Set((labels || []).filter(Boolean))];
  let labelsUsed = requested;
  const availableLabels = await getRepoLabels(runCommand, repo);

  if (availableLabels) {
    labelsUsed = requested.filter(label => availableLabels.has(label));
  }

  const baseArgs = ['issue', 'create', '-R', repo, '--title', title, '--body', body];
  const buildArgs = (labelsList) => {
    const args = [...baseArgs];
    for (const label of labelsList) args.push('-l', label);
    return args;
  };

  let ghRes = await runCommand('gh', buildArgs(labelsUsed));
  let retriedWithoutLabels = false;

  if (!ghRes.success && labelsUsed.length > 0 && /label/i.test(String(ghRes.error || ''))) {
    retriedWithoutLabels = true;
    ghRes = await runCommand('gh', buildArgs([]));
    if (ghRes.success) labelsUsed = [];
  }

  return {
    attempted: true,
    repo,
    success: ghRes.success,
    url: ghRes.success ? parseIssueUrl(ghRes.stdout) : null,
    labels_requested: requested,
    labels_used: labelsUsed,
    dropped_labels: requested.filter(label => !labelsUsed.includes(label)),
    retried_without_labels: retriedWithoutLabels,
    error: ghRes.success ? null : (ghRes.error || 'gh_issue_create_failed')
  };
}

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
              results: results.map(r => {
                const entry = {
                  id: r.id,
                  project: r.project,
                  category: r.category,
                  title: r.title,
                  body: r.body.length > 500 ? r.body.slice(0, 500) + '...' : r.body,
                  tags: r.tags,
                  github_url: r.github_url
                };
                try {
                  const links = knowledgeStore.getLinks(r.id);
                  const allLinks = [...links.outgoing, ...links.incoming];
                  if (allLinks.length > 0) entry.links = allLinks;
                } catch { /* links unavailable */ }
                return entry;
              })
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

      const output = { ...result };
      if (sync_github && result.saved) {
        const repo = `${GITHUB_OWNER}/${CENTRAL_KB_REPO_NAME}`;
        const ghLabel = mapCategoryToGitHubLabel(category);
        output.github_sync = await createIssueWithLabelFallback(runCommand, {
          repo,
          title: `${category}: ${title}`,
          body,
          labels: [ghLabel, `project:${project}`]
        });
      }

      return {
        content: [{ type: 'text', text: JSON.stringify(output) }]
      };
    }
  );

  server.registerTool(
    'ctx_kb_link',
    {
      description: 'Управление связями между записями KB (граф знаний). Добавить, удалить или просмотреть связи.',
      inputSchema: z.object({
        action: z.enum(['add', 'remove', 'list']).describe('Действие'),
        source_id: z.number().int().optional().describe('ID исходной записи (для add/remove)'),
        target_id: z.number().int().optional().describe('ID целевой записи (для add/remove)'),
        relation: z.enum(['solves', 'depends_on', 'supersedes', 'related']).optional().describe('Тип связи (для add/remove)'),
        entry_id: z.number().int().optional().describe('ID записи для просмотра связей (для list)')
      }).shape,
    },
    async ({ action, source_id, target_id, relation, entry_id }) => {
      if (!knowledgeStore) {
        return { content: [{ type: 'text', text: 'KB disabled.' }] };
      }

      if (action === 'add') {
        if (!source_id || !target_id || !relation) {
          return { content: [{ type: 'text', text: 'Required: source_id, target_id, relation' }] };
        }
        const result = knowledgeStore.addLink(source_id, target_id, relation);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      if (action === 'remove') {
        if (!source_id || !target_id || !relation) {
          return { content: [{ type: 'text', text: 'Required: source_id, target_id, relation' }] };
        }
        const result = knowledgeStore.removeLink(source_id, target_id, relation);
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      }

      if (action === 'list') {
        if (!entry_id) {
          return { content: [{ type: 'text', text: 'Required: entry_id' }] };
        }
        const links = knowledgeStore.getLinks(entry_id);
        return { content: [{ type: 'text', text: JSON.stringify(links, null, 2) }] };
      }

      return { content: [{ type: 'text', text: 'Unknown action' }] };
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
