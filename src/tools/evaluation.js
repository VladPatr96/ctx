/**
 * Evaluation domain tools: ctx_eval_start, ctx_eval_provider,
 * ctx_eval_complete, ctx_eval_ci_update, ctx_eval_report
 *
 * Records and analyzes consilium runs.
 */

import { z } from 'zod';
import { createEvalStore } from '../evaluation/eval-store.js';

export function registerEvaluationTools(server, { DATA_DIR, cacheStore = null }) {
  let store = null;
  try {
    store = createEvalStore(DATA_DIR);
    if (cacheStore && store) {
      store.setCacheStore(cacheStore);
    }
  } catch (err) {
    console.error('[evaluation-tools] Failed to init eval store:', err.message);
  }

  // --- ctx_eval_start ---
  server.registerTool(
    'ctx_eval_start',
    {
      description: 'Начать запись консилиума. Возвращает run_id для дальнейших вызовов.',
      inputSchema: z.object({
        project: z.string().describe('Имя проекта'),
        topic: z.string().describe('Тема консилиума'),
        mode: z.enum(['providers', 'agents', 'inner']).default('providers').describe('Режим'),
        providers: z.array(z.string()).default([]).describe('Список провайдеров')
      }).shape,
    },
    async ({ project, topic, mode, providers }) => {
      if (!store) {
        return { content: [{ type: 'text', text: 'Eval store unavailable' }] };
      }
      const runId = store.startRun({ project, topic, mode, providers });
      return {
        content: [{ type: 'text', text: JSON.stringify({ run_id: runId }, null, 2) }]
      };
    }
  );

  // --- ctx_eval_provider ---
  server.registerTool(
    'ctx_eval_provider',
    {
      description: 'Записать ответ провайдера в текущий консилиум.',
      inputSchema: z.object({
        run_id: z.string().describe('ID запуска (из ctx_eval_start)'),
        provider: z.string().describe('Имя провайдера (claude, gemini, codex, opencode)'),
        model: z.string().optional().describe('Конкретная модель'),
        status: z.enum(['completed', 'timeout', 'error']).default('completed').describe('Статус'),
        response_ms: z.number().optional().describe('Время ответа в мс'),
        confidence: z.number().optional().describe('Уверенность 0-1'),
        key_idea: z.string().optional().describe('Ключевая идея (кратко)'),
        error_message: z.string().optional().describe('Сообщение об ошибке')
      }).shape,
    },
    async ({ run_id, provider, model, status, response_ms, confidence, key_idea, error_message }) => {
      if (!store) {
        return { content: [{ type: 'text', text: 'Eval store unavailable' }] };
      }
      store.addProviderResponse(run_id, {
        provider, model, status, response_ms, confidence, key_idea, error_message
      });
      return {
        content: [{ type: 'text', text: `Provider response recorded: ${provider} (${status})` }]
      };
    }
  );

  // --- ctx_eval_complete ---
  server.registerTool(
    'ctx_eval_complete',
    {
      description: 'Завершить запись консилиума с итоговым решением.',
      inputSchema: z.object({
        run_id: z.string().describe('ID запуска'),
        proposed_by: z.string().optional().describe('Кто предложил финальное решение'),
        consensus: z.number().default(1).describe('1 = консенсус достигнут, 0 = нет'),
        decision_summary: z.string().optional().describe('Краткое итоговое решение'),
        github_issue_url: z.string().optional().describe('URL issue с решением'),
        rounds: z.number().default(1).describe('Количество раундов')
      }).shape,
    },
    async ({ run_id, proposed_by, consensus, decision_summary, github_issue_url, rounds }) => {
      if (!store) {
        return { content: [{ type: 'text', text: 'Eval store unavailable' }] };
      }
      store.completeRun(run_id, {
        proposed_by, consensus, decision_summary, github_issue_url, rounds
      });
      return {
        content: [{ type: 'text', text: `Consilium run completed: ${run_id}` }]
      };
    }
  );

  // --- ctx_eval_ci_update ---
  server.registerTool(
    'ctx_eval_ci_update',
    {
      description: 'Обновить CI статус для завершённого консилиума.',
      inputSchema: z.object({
        run_id: z.string().describe('ID запуска'),
        status: z.enum(['passed', 'failed']).describe('Результат CI')
      }).shape,
    },
    async ({ run_id, status }) => {
      if (!store) {
        return { content: [{ type: 'text', text: 'Eval store unavailable' }] };
      }
      store.updateCiStatus(run_id, status);
      return {
        content: [{ type: 'text', text: `CI status updated: ${run_id} → ${status}` }]
      };
    }
  );

  // --- ctx_eval_report ---
  server.registerTool(
    'ctx_eval_report',
    {
      description: 'Получить аналитику по консилиумам: медиана раундов, success rate, топ-провайдеры.',
      inputSchema: z.object({
        project: z.string().optional().describe('Фильтр по проекту'),
        last: z.number().default(50).describe('Количество последних запусков')
      }).shape,
    },
    async ({ project, last }) => {
      if (!store) {
        return { content: [{ type: 'text', text: 'Eval store unavailable' }] };
      }
      const report = store.getReport({ project, last });
      return {
        content: [{ type: 'text', text: JSON.stringify(report, null, 2) }]
      };
    }
  );

  // --- ctx_routing_health ---
  server.registerTool(
    'ctx_routing_health',
    {
      description: 'Получить health-данные adaptive routing: решения, распределение, аномалии.',
      inputSchema: z.object({
        last: z.number().default(20).describe('Количество последних решений'),
        since_days: z.number().default(1).describe('Период в днях для статистики')
      }).shape,
    },
    async ({ last, since_days }) => {
      if (!store) {
        return { content: [{ type: 'text', text: 'Eval store unavailable' }] };
      }
      try {
        const health = store.getRoutingHealth({ last, sinceDays: since_days });
        const { detectAnomalies } = await import('../evaluation/routing-anomaly.js');
        const anomalies = detectAnomalies(
          health.anomalyStats, health.distribution, health.total
        );
        const result = {
          total_decisions: health.total,
          sample_count_sufficient: health.total >= 20,
          recent_decisions: health.decisions,
          distribution: health.distribution,
          anomalies,
          stats: health.anomalyStats
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
        };
      } catch (err) {
        return {
          content: [{ type: 'text', text: `Error: ${err.message}` }]
        };
      }
    }
  );

  // --- ctx_cache_stats ---
  server.registerTool(
    'ctx_cache_stats',
    {
      description: 'Получить статистику двухуровневого кэша: L1 (RAM), L2 (SQLite), hit rates, namespaces.',
      inputSchema: z.object({}).shape,
    },
    async () => {
      if (!cacheStore) {
        return { content: [{ type: 'text', text: 'Cache store unavailable' }] };
      }
      const s = cacheStore.stats();
      const result = {
        l1: {
          size_bytes: s.l1.size,
          count: s.l1.count,
          hits: s.l1.hits,
          misses: s.l1.misses,
          hit_rate: `${s.l1.hitRate}%`,
        },
        l2: {
          count: s.l2.count,
          size_bytes: s.l2.sizeBytes,
          hits: s.l2.hits,
          misses: s.l2.misses,
          hit_rate: `${s.l2.hitRate}%`,
        },
        namespaces: s.namespaces,
      };
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
      };
    }
  );

  // Cleanup on process exit
  process.on('exit', () => {
    if (store) store.close();
  });
}
