/**
 * Cost Calculator — вычисление стоимости API вызовов на основе токенов.
 *
 * Функции:
 * - Расчёт стоимости по токенам (input/output)
 * - Детальная разбивка затрат
 * - Поддержка batch расчётов
 * - Кэширование результатов
 */

import { getPricing } from './pricing.js';

// ---- Cache ----

const _costCache = new Map(); // cacheKey → cost result
const CACHE_MAX_SIZE = 1000;

function getCacheKey(provider, modelId, inputTokens, outputTokens) {
  return `${provider}/${modelId}/${inputTokens}/${outputTokens}`;
}

function clearCacheIfFull() {
  if (_costCache.size > CACHE_MAX_SIZE) {
    // Remove oldest entries (first 20%)
    const entriesToRemove = Math.floor(CACHE_MAX_SIZE * 0.2);
    const keys = Array.from(_costCache.keys());
    for (let i = 0; i < entriesToRemove; i++) {
      _costCache.delete(keys[i]);
    }
  }
}

// ---- Input Validation ----

function toNonNegativeInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function validateUsage(usage) {
  if (!usage || typeof usage !== 'object') {
    return { inputTokens: 0, outputTokens: 0 };
  }

  return {
    inputTokens: toNonNegativeInt(usage.inputTokens, 0),
    outputTokens: toNonNegativeInt(usage.outputTokens, 0)
  };
}

// ---- Cost Calculation ----

/**
 * Calculate cost from token usage.
 *
 * @param {string} provider - Provider name (claude, gemini, codex, opencode)
 * @param {string} modelId - Model ID or alias
 * @param {Object} usage - Token usage object
 * @param {number} usage.inputTokens - Number of input tokens
 * @param {number} usage.outputTokens - Number of output tokens
 * @returns {number} Total cost in USD
 *
 * @example
 * calculateCost('claude', 'opus-4.6', { inputTokens: 1000, outputTokens: 500 })
 * // Returns: 0.0525 (USD)
 */
export function calculateCost(provider, modelId, usage) {
  if (!provider || !modelId) return 0;

  const validated = validateUsage(usage);
  const { inputTokens, outputTokens } = validated;

  if (inputTokens === 0 && outputTokens === 0) return 0;

  // Check cache
  const cacheKey = getCacheKey(provider, modelId, inputTokens, outputTokens);
  if (_costCache.has(cacheKey)) {
    return _costCache.get(cacheKey);
  }

  // Get pricing
  const pricing = getPricing(provider, modelId);
  if (!pricing) return 0;

  // Calculate costs
  const inputCost = (inputTokens / 1_000_000) * pricing.inputCostPerMTok;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputCostPerMTok;
  const totalCost = inputCost + outputCost;

  // Round to 6 decimal places to avoid floating point issues
  const roundedCost = Math.round(totalCost * 1_000_000) / 1_000_000;

  // Cache result
  clearCacheIfFull();
  _costCache.set(cacheKey, roundedCost);

  return roundedCost;
}

/**
 * Estimate cost for a given token count using average pricing.
 *
 * @param {number} totalTokens - Total token count (input + output)
 * @param {string} [tier='balanced'] - Pricing tier (flagship, balanced, fast)
 * @returns {number} Estimated cost in USD
 */
export function estimateCost(totalTokens, tier = 'balanced') {
  const tokens = toNonNegativeInt(totalTokens, 0);
  if (tokens === 0) return 0;

  // Average costs per MTok by tier
  const avgCosts = {
    flagship: 45.0,  // Average of input+output for flagship models
    balanced: 9.0,   // Average for balanced models
    fast: 0.8        // Average for fast models
  };

  const costPerMTok = avgCosts[tier] || avgCosts.balanced;
  const cost = (tokens / 1_000_000) * costPerMTok;

  return Math.round(cost * 1_000_000) / 1_000_000;
}

/**
 * Clear cost calculation cache.
 */
export function clearCache() {
  _costCache.clear();
}

/**
 * Get cache statistics.
 *
 * @returns {Object} Cache stats
 */
export function getCacheStats() {
  return {
    size: _costCache.size,
    maxSize: CACHE_MAX_SIZE
  };
}
