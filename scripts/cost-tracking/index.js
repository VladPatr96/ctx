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
import { checkBudget } from './budget-alerts.js';

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

    // Check budget alerts after recording
    const budgetChecks = [];

    // Check global budget
    const totalCost = costStore.getTotalCost();
    const globalCheck = checkBudget(totalCost);
    if (globalCheck.alert) {
      budgetChecks.push({
        type: 'global',
        ...globalCheck
      });
    }

    // Check provider-specific budget
    const providerCosts = costStore.getCostsByProvider();
    const providerCost = providerCosts[usage.provider]?.totalCost || 0;
    const providerCheck = checkBudget(providerCost, { provider: usage.provider });
    if (providerCheck.alert && providerCheck.budgetType === 'provider') {
      budgetChecks.push({
        type: 'provider',
        provider: usage.provider,
        ...providerCheck
      });
    }

    // Check session-specific budget
    if (usage.sessionId) {
      const sessionCost = costStore.getCostsBySession(usage.sessionId);
      if (sessionCost) {
        const sessionCheck = checkBudget(sessionCost.totalCost, { sessionId: usage.sessionId });
        if (sessionCheck.alert && sessionCheck.budgetType === 'session') {
          budgetChecks.push({
            type: 'session',
            sessionId: usage.sessionId,
            ...sessionCheck
          });
        }
      }
    }

    // Check project-specific budget
    if (usage.projectId) {
      const projectCost = costStore.getCostsByProject(usage.projectId);
      if (projectCost) {
        const projectCheck = checkBudget(projectCost.totalCost, { projectId: usage.projectId });
        if (projectCheck.alert && projectCheck.budgetType === 'project') {
          budgetChecks.push({
            type: 'project',
            projectId: usage.projectId,
            ...projectCheck
          });
        }
      }
    }

    // Log budget warnings
    for (const check of budgetChecks) {
      const context = check.type === 'global'
        ? 'Global budget'
        : check.type === 'provider'
          ? `Provider '${check.provider}' budget`
          : check.type === 'session'
            ? `Session '${check.sessionId}' budget`
            : `Project '${check.projectId}' budget`;

      const message = check.alert === 'exceeded'
        ? `⚠️  BUDGET EXCEEDED: ${context} - $${check.currentCost.toFixed(4)} / $${check.budget.toFixed(2)} (${check.percentUsed}%)`
        : check.alert === 'critical'
          ? `⚠️  CRITICAL: ${context} - $${check.currentCost.toFixed(4)} / $${check.budget.toFixed(2)} (${check.percentUsed}% used, $${check.remaining.toFixed(4)} remaining)`
          : `⚠️  WARNING: ${context} - $${check.currentCost.toFixed(4)} / $${check.budget.toFixed(2)} (${check.percentUsed}% used, $${check.remaining.toFixed(4)} remaining)`;

      // Use stderr for warnings so they're visible even when stdout is captured
      process.stderr.write(message + '\n');
    }

    return {
      status: 'success',
      totalCost: cost,
      inputTokens,
      outputTokens,
      budgetAlerts: budgetChecks.length > 0 ? budgetChecks : undefined
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
