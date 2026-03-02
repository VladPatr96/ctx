/**
 * Executor — координатор жизненного цикла: worktree + provider invoke.
 *
 * Создаёт worktree → запускает CLI провайдер → собирает результат → очищает.
 * Состояние персистится в .data/executions.json с файловой блокировкой.
 */

import { join } from 'node:path';
import { readJsonFile, writeJsonAtomic, withLockSync } from '../utils/state-io.js';
import { createWorktree, removeWorktree, getPluginRoot } from './worktree-manager.js';

// ==================== Paths (lazy for testability) ====================

function getDataDir() {
  return process.env.CTX_DATA_DIR || join(getPluginRoot(), '.data');
}

function getStateFile() {
  return join(getDataDir(), 'executions.json');
}

function getLockFile() {
  return join(getDataDir(), '.executions.lock');
}

// ==================== State helpers ====================

function loadState() {
  return readJsonFile(getStateFile(), { executions: {} });
}

function saveState(state) {
  writeJsonAtomic(getStateFile(), state);
}

function withState(fn) {
  return withLockSync(getLockFile(), () => {
    const state = loadState();
    const result = fn(state);
    saveState(state);
    return result;
  });
}

// ==================== executeAgent ====================

/**
 * Запускает одного агента в изолированном worktree.
 *
 * @param {string} agentId — kebab-case идентификатор
 * @param {object} opts
 * @param {string} opts.task — задача/промпт для провайдера
 * @param {string} opts.provider — имя провайдера (claude, gemini, opencode, codex)
 * @param {number} [opts.timeout=120000] — таймаут invoke в ms
 * @param {string} [opts.baseBranch='master'] — базовая ветка для worktree
 * @param {boolean} [opts.cleanup=true] — удалять worktree после завершения
 * @param {Function} [opts.invokeFn] — injection для тестов (заменяет providers/index invoke)
 * @returns {Promise<object>} результат выполнения
 */
export async function executeAgent(agentId, opts = {}) {
  const {
    task,
    provider,
    timeout = 120_000,
    baseBranch = 'master',
    cleanup = true,
    invokeFn = null,
  } = opts;

  if (!task) throw new Error('task is required');
  if (!provider) throw new Error('provider is required');

  const startedAt = new Date().toISOString();

  // Register pending execution
  const wtInfo = withState(state => {
    if (state.executions[agentId]?.status === 'running') {
      throw new Error(`Agent "${agentId}" is already running`);
    }
    state.executions[agentId] = {
      agentId,
      provider,
      task,
      status: 'pending',
      startedAt,
      completedAt: null,
      durationMs: null,
      response: null,
      error: null,
      worktreePath: null,
      branchName: null,
    };
    return null;
  });

  let worktreePath = null;
  let branchName = null;

  try {
    // 1. Create worktree
    const wt = await createWorktree(agentId, { baseBranch, task, provider });
    worktreePath = wt.path;
    branchName = wt.branch;

    // Update state → running
    withState(state => {
      const entry = state.executions[agentId];
      if (entry) {
        entry.status = 'running';
        entry.worktreePath = worktreePath;
        entry.branchName = branchName;
      }
    });

    // 2. Invoke provider
    const doInvoke = invokeFn || (await import('../providers/index.js')).invoke;

    let timeoutId;
    const result = await Promise.race([
      doInvoke(provider, task, { timeout, cwd: worktreePath }),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('Execution timeout')), timeout);
      }),
    ]);
    clearTimeout(timeoutId);

    // 3. Record success/failure
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(startedAt).getTime();

    const status = result.status === 'success' ? 'completed' : 'failed';
    const entry = withState(state => {
      state.executions[agentId] = {
        ...state.executions[agentId],
        status,
        response: result.response || null,
        error: result.error || null,
        completedAt,
        durationMs,
      };
      return { ...state.executions[agentId] };
    });

    // 4. Cleanup worktree if requested
    if (cleanup) {
      try {
        await removeWorktree(agentId, { force: true });
      } catch {
        // non-fatal: worktree cleanup failure shouldn't fail the execution
      }
    }

    return entry;
  } catch (err) {
    const completedAt = new Date().toISOString();
    const durationMs = Date.now() - new Date(startedAt).getTime();
    const isTimeout = err.message === 'Execution timeout';

    const entry = withState(state => {
      state.executions[agentId] = {
        ...state.executions[agentId],
        status: isTimeout ? 'timeout' : 'failed',
        error: err.message,
        completedAt,
        durationMs,
      };
      return { ...state.executions[agentId] };
    });

    // Cleanup on failure too
    if (cleanup && worktreePath) {
      try {
        await removeWorktree(agentId, { force: true });
      } catch {
        // non-fatal
      }
    }

    return entry;
  }
}

// ==================== Query functions ====================

/**
 * Получить статус выполнения агента.
 * @param {string} agentId
 * @returns {object|null}
 */
export function getExecutionStatus(agentId) {
  const state = loadState();
  return state.executions[agentId] || null;
}

/**
 * Список выполнений с опциональной фильтрацией.
 * @param {object} [opts]
 * @param {string} [opts.status] — фильтр по статусу
 * @returns {object[]}
 */
export function listExecutions(opts = {}) {
  const state = loadState();
  let entries = Object.values(state.executions);
  if (opts.status) {
    entries = entries.filter(e => e.status === opts.status);
  }
  return entries;
}

/**
 * Очистка: удаление worktree + запись из state.
 * @param {string} agentId
 * @param {object} [opts]
 * @param {boolean} [opts.deleteBranch=false]
 */
export async function cleanupExecution(agentId, opts = {}) {
  const { deleteBranch = false } = opts;

  // Try to remove worktree (may already be removed)
  try {
    await removeWorktree(agentId, { deleteBranch, force: true });
  } catch {
    // already removed or doesn't exist
  }

  // Remove from state
  withState(state => {
    delete state.executions[agentId];
  });
}
