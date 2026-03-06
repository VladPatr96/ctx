/**
 * Cost Tracking — основной модуль для записи и анализа затрат на API вызовы.
 *
 * Функции:
 * - Запись использования токенов и расчёт стоимости
 * - Агрегация по провайдерам, моделям, сессиям
 * - Получение статистики затрат
 *
 * Архитектура:
 * - Использует CostStore для thread-safe хранения данных
 * - Использует cost-calculator для расчёта стоимости
 * - Предоставляет unified API для всех операций с затратами
 */

import { calculateCost, calculateCostBreakdown } from './cost-calculator.js';
import { createCostStore } from './cost-store.js';

// Singleton instance of cost store
const costStore = createCostStore();

// ---- Usage Recording ----

/**
 * Record token usage and calculate cost.
 *
 * @param {Object} usage - Usage information
 * @param {string} usage.provider - Provider name (claude, gemini, codex, opencode)
 * @param {string} usage.model - Model ID or alias
 * @param {number} usage.inputTokens - Number of input tokens
 * @param {number} usage.outputTokens - Number of output tokens
 * @param {string} [usage.sessionId] - Optional session identifier
 * @param {string} [usage.projectId] - Optional project identifier
 * @param {Object} [usage.metadata] - Optional metadata (task, prompt snippet, etc.)
 * @returns {Object} Cost record with calculated cost
 */
export function recordUsage(usage) {
  if (!usage || !usage.provider || !usage.model) {
    return { status: 'error', error: 'Invalid usage data: provider and model required' };
  }

  const inputTokens = Number.parseInt(String(usage.inputTokens ?? 0), 10) || 0;
  const outputTokens = Number.parseInt(String(usage.outputTokens ?? 0), 10) || 0;

  if (inputTokens === 0 && outputTokens === 0) {
    return { status: 'skipped', reason: 'No tokens to record' };
  }

  // Calculate cost
  const cost = calculateCost(usage.provider, usage.model, { inputTokens, outputTokens });

  try {
    // Record via CostStore (thread-safe, atomic)
    costStore.recordCost({
      provider: usage.provider,
      model: usage.model,
      inputTokens,
      outputTokens,
      cost,
      sessionId: usage.sessionId || null,
      projectId: usage.projectId || null,
      metadata: usage.metadata || {}
    });

    return {
      status: 'success',
      totalCost: cost,
      inputTokens,
      outputTokens
    };
  } catch (error) {
    return {
      status: 'error',
      error: `Failed to record cost: ${error.message}`
    };
  }
}

/**
 * Get total cost across all requests.
 *
 * @returns {number} Total cost in USD
 */
export function getTotalCost() {
  return costStore.getTotalCost();
}

/**
 * Get cost summary by provider.
 *
 * @returns {Object} Map of provider → cost stats
 */
export function getCostsByProvider() {
  return costStore.getCostsByProvider();
}

/**
 * Get cost summary for a specific session.
 *
 * @param {string} sessionId - Session identifier
 * @returns {Object|null} Session cost stats or null if not found
 */
export function getCostsBySession(sessionId) {
  return costStore.getCostsBySession(sessionId);
}

/**
 * Get cost summary for a specific project.
 *
 * @param {string} projectId - Project identifier
 * @returns {Object|null} Project cost stats or null if not found
 */
export function getCostsByProject(projectId) {
  return costStore.getCostsByProject(projectId);
}

/**
 * Get comprehensive cost summary.
 *
 * @returns {Object} Complete cost summary
 */
export function getCostSummary() {
  return costStore.getCostSummary();
}

/**
 * Clear all cost tracking data.
 */
export function clearCostData() {
  costStore.clearCostData();
}

export default {
  recordUsage,
  getTotalCost,
  getCostsByProvider,
  getCostsBySession,
  getCostsByProject,
  getCostSummary,
  clearCostData
};
