/**
 * Cost Tracking — основной модуль для записи и анализа затрат на API вызовы.
 *
 * Функции:
 * - Запись использования токенов и расчёт стоимости
 * - Агрегация по провайдерам, моделям, сессиям
 * - Получение статистики затрат
 */

import { calculateCost, calculateCostBreakdown } from './cost-calculator.js';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', '..', '.data');
const COST_TRACKING_FILE = join(DATA_DIR, 'cost-tracking.json');

// Ensure data directory exists
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

// ---- Data Loading/Saving ----

function loadCostData() {
  try {
    if (!existsSync(COST_TRACKING_FILE)) {
      return { requests: [], sessions: {}, metadata: { createdAt: new Date().toISOString() } };
    }
    return JSON.parse(readFileSync(COST_TRACKING_FILE, 'utf-8'));
  } catch {
    return { requests: [], sessions: {}, metadata: { createdAt: new Date().toISOString() } };
  }
}

function saveCostData(data) {
  try {
    data.metadata = data.metadata || {};
    data.metadata.updatedAt = new Date().toISOString();
    writeFileSync(COST_TRACKING_FILE, JSON.stringify(data, null, 2));
  } catch { /* ignore write errors */ }
}

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
  const breakdown = calculateCostBreakdown(usage.provider, usage.model, { inputTokens, outputTokens });

  // Create cost record
  const record = {
    timestamp: new Date().toISOString(),
    provider: usage.provider,
    model: usage.model,
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    cost,
    breakdown: {
      inputCost: breakdown.inputCost,
      outputCost: breakdown.outputCost,
      pricing: breakdown.pricing
    },
    sessionId: usage.sessionId || null,
    projectId: usage.projectId || null,
    metadata: usage.metadata || {}
  };

  // Load, append, save
  const data = loadCostData();
  data.requests = data.requests || [];
  data.requests.push(record);

  // Update session totals
  if (usage.sessionId) {
    data.sessions = data.sessions || {};
    if (!data.sessions[usage.sessionId]) {
      data.sessions[usage.sessionId] = {
        createdAt: record.timestamp,
        totalCost: 0,
        totalTokens: 0,
        requests: 0
      };
    }
    const session = data.sessions[usage.sessionId];
    session.totalCost += cost;
    session.totalTokens += record.totalTokens;
    session.requests += 1;
    session.updatedAt = record.timestamp;
  }

  saveCostData(data);

  return {
    status: 'success',
    record,
    totalCost: cost
  };
}

/**
 * Get total cost across all requests.
 *
 * @returns {number} Total cost in USD
 */
export function getTotalCost() {
  const data = loadCostData();
  if (!data.requests || data.requests.length === 0) return 0;

  return data.requests.reduce((sum, req) => sum + (req.cost || 0), 0);
}

/**
 * Get cost summary by provider.
 *
 * @returns {Object} Map of provider → cost stats
 */
export function getCostsByProvider() {
  const data = loadCostData();
  if (!data.requests || data.requests.length === 0) return {};

  const byProvider = {};

  for (const req of data.requests) {
    const provider = req.provider;
    if (!byProvider[provider]) {
      byProvider[provider] = {
        totalCost: 0,
        requests: 0,
        totalTokens: 0,
        models: {}
      };
    }

    byProvider[provider].totalCost += req.cost || 0;
    byProvider[provider].requests += 1;
    byProvider[provider].totalTokens += req.totalTokens || 0;

    // Track by model
    const model = req.model;
    if (!byProvider[provider].models[model]) {
      byProvider[provider].models[model] = {
        totalCost: 0,
        requests: 0,
        totalTokens: 0
      };
    }
    byProvider[provider].models[model].totalCost += req.cost || 0;
    byProvider[provider].models[model].requests += 1;
    byProvider[provider].models[model].totalTokens += req.totalTokens || 0;
  }

  return byProvider;
}

/**
 * Get cost summary for a specific session.
 *
 * @param {string} sessionId - Session identifier
 * @returns {Object|null} Session cost stats or null if not found
 */
export function getCostsBySession(sessionId) {
  const data = loadCostData();
  return data.sessions?.[sessionId] || null;
}

/**
 * Get comprehensive cost summary.
 *
 * @returns {Object} Complete cost summary
 */
export function getCostSummary() {
  const data = loadCostData();
  const totalCost = getTotalCost();
  const byProvider = getCostsByProvider();

  return {
    totalCost,
    totalRequests: data.requests?.length || 0,
    byProvider,
    sessions: data.sessions || {},
    lastUpdated: data.metadata?.updatedAt || null
  };
}

export default {
  recordUsage,
  getTotalCost,
  getCostsByProvider,
  getCostsBySession,
  getCostSummary
};
