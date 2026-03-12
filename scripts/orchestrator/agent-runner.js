/**
 * AgentRunner — параллельный запуск нескольких executor'ов с concurrency-лимитом.
 *
 * Использует inline-семафор и Promise.allSettled для параллельности,
 * Promise.race с глобальным таймером для общего ограничения времени.
 */

import { executeAgent } from './executor.js';

// ==================== Semaphore ====================

function createSemaphore(limit) {
  let running = 0;
  const queue = [];

  return {
    async acquire() {
      if (running < limit) {
        running++;
        return;
      }
      await new Promise(resolve => queue.push(resolve));
      running++;
    },
    release() {
      running--;
      if (queue.length > 0) {
        queue.shift()();
      }
    },
  };
}

// ==================== runParallel ====================

/**
 * Параллельный запуск нескольких агентов с ограничением concurrency.
 *
 * @param {object[]} specs — массив спецификаций [{agentId, task, provider, timeout?}]
 * @param {object} [opts]
 * @param {number} [opts.concurrency=3] — макс. параллельных запусков
 * @param {number} [opts.globalTimeout=300000] — глобальный таймаут для всех
 * @param {string} [opts.baseBranch] — базовая ветка; по умолчанию определяется автоматически
 * @param {boolean} [opts.cleanup=true] — удалять worktrees после завершения
 * @param {Function} [opts.invokeFn] — injection для тестов
 * @returns {Promise<object>} сводка выполнения
 */
export async function runParallel(specs, opts = {}) {
  const {
    concurrency = 3,
    globalTimeout = 300_000,
    baseBranch,
    cleanup = true,
    invokeFn = null,
  } = opts;

  if (!Array.isArray(specs) || specs.length === 0) {
    throw new Error('specs must be a non-empty array');
  }

  const startedAt = new Date().toISOString();
  const sem = createSemaphore(concurrency);

  const runOne = async (spec) => {
    await sem.acquire();
    try {
      return await executeAgent(spec.agentId, {
        task: spec.task,
        provider: spec.provider,
        timeout: spec.timeout,
        baseBranch,
        cleanup,
        invokeFn,
      });
    } finally {
      sem.release();
    }
  };

  const work = Promise.allSettled(specs.map(runOne));

  let globalTimerId;
  const globalTimer = new Promise((_, reject) => {
    globalTimerId = setTimeout(() => reject(new Error('Global timeout')), globalTimeout);
  });

  let settled;
  let timedOut = false;

  try {
    settled = await Promise.race([work, globalTimer]);
  } catch (err) {
    if (err.message === 'Global timeout') {
      timedOut = true;
      // Wait for already-started tasks to settle (they have their own timeouts)
      settled = await work;
    } else {
      throw err;
    }
  } finally {
    clearTimeout(globalTimerId);
  }

  const completedAt = new Date().toISOString();
  const durationMs = Date.now() - new Date(startedAt).getTime();

  const results = settled.map((s, i) => {
    if (s.status === 'fulfilled') return s.value;
    return {
      agentId: specs[i].agentId,
      provider: specs[i].provider,
      status: 'failed',
      error: s.reason?.message || 'Unknown error',
    };
  });

  const summary = {
    total: results.length,
    completed: results.filter(r => r.status === 'completed').length,
    failed: results.filter(r => r.status === 'failed').length,
    timedOut: results.filter(r => r.status === 'timeout').length,
  };

  return {
    status: timedOut ? 'global_timeout' : (summary.failed + summary.timedOut > 0 ? 'partial' : 'success'),
    startedAt,
    completedAt,
    durationMs,
    results,
    summary,
  };
}
