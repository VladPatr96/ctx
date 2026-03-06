/**
 * Budget Alerts — threshold-based monitoring and alerting for cost tracking.
 *
 * Функции:
 * - Установка бюджетных лимитов (global, per-provider, per-session, per-project)
 * - Проверка текущих затрат против установленных лимитов
 * - Генерация предупреждений при превышении порогов
 *
 * Архитектура:
 * - Использует файловое хранилище для конфигурации бюджетов
 * - Интегрируется с cost-tracking для получения текущих затрат
 * - Поддерживает множественные уровни предупреждений (warning, critical)
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', '.data');
const BUDGET_FILE = join(DATA_DIR, 'budget-config.json');

/**
 * Ensure .data directory exists
 */
function ensureDataDir() {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

/**
 * Load budget configuration from file
 * @returns {Object} Budget configuration
 */
function loadBudgetConfig() {
  try {
    if (!existsSync(BUDGET_FILE)) {
      return {
        global: null,
        providers: {},
        sessions: {},
        projects: {},
        thresholds: {
          warning: 0.8,  // 80% of budget
          critical: 0.95 // 95% of budget
        },
        metadata: {
          createdAt: new Date().toISOString()
        }
      };
    }
    return JSON.parse(readFileSync(BUDGET_FILE, 'utf-8'));
  } catch (error) {
    return {
      global: null,
      providers: {},
      sessions: {},
      projects: {},
      thresholds: {
        warning: 0.8,
        critical: 0.95
      },
      metadata: {
        createdAt: new Date().toISOString()
      }
    };
  }
}

/**
 * Save budget configuration to file
 * @param {Object} config - Budget configuration to save
 */
function saveBudgetConfig(config) {
  try {
    ensureDataDir();
    config.metadata = config.metadata || {};
    config.metadata.updatedAt = new Date().toISOString();
    writeFileSync(BUDGET_FILE, JSON.stringify(config, null, 2));
  } catch (error) {
    throw new Error(`Failed to save budget config: ${error.message}`);
  }
}

/**
 * Normalize budget value to non-negative number
 * @param {*} value - Value to normalize
 * @returns {number} Non-negative number or null
 */
function normalizeBudget(value) {
  if (value === null || value === undefined) return null;
  const parsed = Number.parseFloat(String(value));
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return parsed;
}

/**
 * Set global budget limit
 * @param {number} amount - Budget amount in USD
 */
export function setBudget(amount) {
  const budget = normalizeBudget(amount);
  if (budget === null && amount !== null) {
    throw new Error('Budget must be a non-negative number');
  }

  const config = loadBudgetConfig();
  config.global = budget;
  saveBudgetConfig(config);
}

/**
 * Set budget limit for a specific provider
 * @param {string} provider - Provider name
 * @param {number} amount - Budget amount in USD
 */
export function setProviderBudget(provider, amount) {
  if (!provider) {
    throw new Error('Provider name is required');
  }

  const budget = normalizeBudget(amount);
  if (budget === null && amount !== null) {
    throw new Error('Budget must be a non-negative number');
  }

  const config = loadBudgetConfig();
  if (budget === null) {
    delete config.providers[provider];
  } else {
    config.providers[provider] = budget;
  }
  saveBudgetConfig(config);
}

/**
 * Set budget limit for a specific session
 * @param {string} sessionId - Session identifier
 * @param {number} amount - Budget amount in USD
 */
export function setSessionBudget(sessionId, amount) {
  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  const budget = normalizeBudget(amount);
  if (budget === null && amount !== null) {
    throw new Error('Budget must be a non-negative number');
  }

  const config = loadBudgetConfig();
  if (budget === null) {
    delete config.sessions[sessionId];
  } else {
    config.sessions[sessionId] = budget;
  }
  saveBudgetConfig(config);
}

/**
 * Set budget limit for a specific project
 * @param {string} projectId - Project identifier
 * @param {number} amount - Budget amount in USD
 */
export function setProjectBudget(projectId, amount) {
  if (!projectId) {
    throw new Error('Project ID is required');
  }

  const budget = normalizeBudget(amount);
  if (budget === null && amount !== null) {
    throw new Error('Budget must be a non-negative number');
  }

  const config = loadBudgetConfig();
  if (budget === null) {
    delete config.projects[projectId];
  } else {
    config.projects[projectId] = budget;
  }
  saveBudgetConfig(config);
}

/**
 * Set warning and critical thresholds
 * @param {Object} thresholds - Threshold configuration
 * @param {number} [thresholds.warning] - Warning threshold (0-1, default 0.8)
 * @param {number} [thresholds.critical] - Critical threshold (0-1, default 0.95)
 */
export function setThresholds(thresholds = {}) {
  const config = loadBudgetConfig();

  if (thresholds.warning !== undefined) {
    const warning = Number.parseFloat(String(thresholds.warning));
    if (!Number.isFinite(warning) || warning < 0 || warning > 1) {
      throw new Error('Warning threshold must be between 0 and 1');
    }
    config.thresholds.warning = warning;
  }

  if (thresholds.critical !== undefined) {
    const critical = Number.parseFloat(String(thresholds.critical));
    if (!Number.isFinite(critical) || critical < 0 || critical > 1) {
      throw new Error('Critical threshold must be between 0 and 1');
    }
    config.thresholds.critical = critical;
  }

  saveBudgetConfig(config);
}

/**
 * Get current budget configuration
 * @returns {Object} Budget configuration
 */
export function getBudgetConfig() {
  return loadBudgetConfig();
}

/**
 * Check current spending against budget
 * @param {number} currentCost - Current cost to check
 * @param {Object} [options] - Check options
 * @param {string} [options.provider] - Check provider-specific budget
 * @param {string} [options.sessionId] - Check session-specific budget
 * @param {string} [options.projectId] - Check project-specific budget
 * @returns {Object} Budget check result
 */
export function checkBudget(currentCost, options = {}) {
  const cost = normalizeBudget(currentCost);
  if (cost === null) {
    return {
      status: 'error',
      error: 'Invalid cost value'
    };
  }

  const config = loadBudgetConfig();
  let budget = null;
  let budgetType = 'none';

  // Determine which budget to check (priority: specific > provider > global)
  if (options.sessionId && config.sessions[options.sessionId] !== undefined) {
    budget = config.sessions[options.sessionId];
    budgetType = 'session';
  } else if (options.projectId && config.projects[options.projectId] !== undefined) {
    budget = config.projects[options.projectId];
    budgetType = 'project';
  } else if (options.provider && config.providers[options.provider] !== undefined) {
    budget = config.providers[options.provider];
    budgetType = 'provider';
  } else if (config.global !== null) {
    budget = config.global;
    budgetType = 'global';
  }

  // No budget configured
  if (budget === null) {
    return {
      status: 'ok',
      budgetType: 'none',
      currentCost: cost,
      budget: null,
      remaining: null,
      percentUsed: null,
      alert: null
    };
  }

  const remaining = Math.max(0, budget - cost);
  const percentUsed = budget > 0 ? (cost / budget) : 0;
  const warningThreshold = config.thresholds.warning;
  const criticalThreshold = config.thresholds.critical;

  let alert = null;
  let status = 'ok';

  // Check thresholds
  if (cost >= budget) {
    alert = 'exceeded';
    status = 'exceeded';
  } else if (percentUsed >= criticalThreshold) {
    alert = 'critical';
    status = 'critical';
  } else if (percentUsed >= warningThreshold) {
    alert = 'warning';
    status = 'warning';
  }

  return {
    status,
    budgetType,
    currentCost: cost,
    budget,
    remaining,
    percentUsed: Number((percentUsed * 100).toFixed(1)),
    alert,
    thresholds: {
      warning: warningThreshold,
      critical: criticalThreshold
    }
  };
}

/**
 * Get budget status for all configured budgets
 * @param {Object} costs - Current costs object
 * @param {number} costs.total - Total cost
 * @param {Object} [costs.byProvider] - Cost by provider
 * @param {Object} [costs.bySessions] - Cost by session
 * @param {Object} [costs.byProjects] - Cost by project
 * @returns {Object} Budget status for all budgets
 */
export function checkAllBudgets(costs = {}) {
  const config = loadBudgetConfig();
  const results = {
    global: null,
    providers: {},
    sessions: {},
    projects: {},
    hasAlerts: false
  };

  // Check global budget
  if (config.global !== null && costs.total !== undefined) {
    results.global = checkBudget(costs.total);
    if (results.global.alert) {
      results.hasAlerts = true;
    }
  }

  // Check provider budgets
  if (costs.byProvider) {
    for (const [provider, providerCost] of Object.entries(costs.byProvider)) {
      if (config.providers[provider] !== undefined) {
        results.providers[provider] = checkBudget(
          providerCost.totalCost || providerCost,
          { provider }
        );
        if (results.providers[provider].alert) {
          results.hasAlerts = true;
        }
      }
    }
  }

  // Check session budgets
  if (costs.bySessions) {
    for (const [sessionId, sessionCost] of Object.entries(costs.bySessions)) {
      if (config.sessions[sessionId] !== undefined) {
        results.sessions[sessionId] = checkBudget(
          sessionCost.totalCost || sessionCost,
          { sessionId }
        );
        if (results.sessions[sessionId].alert) {
          results.hasAlerts = true;
        }
      }
    }
  }

  // Check project budgets
  if (costs.byProjects) {
    for (const [projectId, projectCost] of Object.entries(costs.byProjects)) {
      if (config.projects[projectId] !== undefined) {
        results.projects[projectId] = checkBudget(
          projectCost.totalCost || projectCost,
          { projectId }
        );
        if (results.projects[projectId].alert) {
          results.hasAlerts = true;
        }
      }
    }
  }

  return results;
}

export default {
  setBudget,
  setProviderBudget,
  setSessionBudget,
  setProjectBudget,
  setThresholds,
  getBudgetConfig,
  checkBudget,
  checkAllBudgets
};
