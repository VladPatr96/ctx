/**
 * Optimization Engine — анализирует затраты и предлагает более экономичные альтернативы.
 *
 * Функции:
 * - Сравнение стоимости разных провайдеров
 * - Расчёт cost-per-request, cost-per-token метрик
 * - Генерация рекомендаций по оптимизации затрат
 * - Учёт quality scores (success rate и latency)
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCostStore } from './cost-store.js';
import { getPricing, getProviderPricing } from './pricing.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEALTH_FILE = join(__dirname, '..', '..', '.data', 'provider-health.json');

// Singleton cost store instance
const costStore = createCostStore();

// ---- Health & Quality Metrics ----

/**
 * Load provider health data.
 *
 * @returns {Object} Health data by provider
 */
function loadHealth() {
  try {
    return JSON.parse(readFileSync(HEALTH_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

/**
 * Calculate quality score for a provider based on success rate and latency.
 *
 * Quality score is a weighted combination of:
 * - Success rate (70% weight): Higher success rate = better quality
 * - Latency (30% weight): Lower latency = better quality
 *
 * @param {string} provider - Provider name
 * @returns {Object|null} Quality metrics { qualityScore, successRate, avgLatencyMs }
 */
function calculateQualityScore(provider) {
  const health = loadHealth();
  const entry = health[provider];

  if (!entry || !entry.calls || entry.calls < 3) {
    return null; // Not enough data
  }

  const successRate = entry.successRate || 0;
  const avgLatencyMs = entry.avgLatencyMs || 0;

  // Normalize success rate to 0-100 (already in percentage)
  const successScore = successRate;

  // Normalize latency to 0-100 scale
  // Assumptions: <500ms is excellent (100), >5000ms is poor (0)
  const maxAcceptableLatency = 5000;
  const minExcellentLatency = 500;

  let latencyScore;
  if (avgLatencyMs <= minExcellentLatency) {
    latencyScore = 100;
  } else if (avgLatencyMs >= maxAcceptableLatency) {
    latencyScore = 0;
  } else {
    // Linear scale between 500ms and 5000ms
    latencyScore = 100 - ((avgLatencyMs - minExcellentLatency) / (maxAcceptableLatency - minExcellentLatency) * 100);
  }

  // Weighted combination: 70% success rate, 30% latency
  const qualityScore = Math.round((successScore * 0.7) + (latencyScore * 0.3));

  return {
    qualityScore,
    successRate,
    avgLatencyMs,
    calls: entry.calls
  };
}

// ---- Cost Efficiency Metrics ----

/**
 * Calculate efficiency metrics for a provider.
 *
 * @param {Object} providerData - Cost data for provider from cost store
 * @param {string} provider - Provider name
 * @returns {Object} Efficiency metrics
 */
function calculateEfficiencyMetrics(providerData, provider) {
  if (!providerData || providerData.requests === 0) {
    return null;
  }

  const avgCostPerRequest = providerData.totalCost / providerData.requests;
  const avgCostPerToken = providerData.totalTokens > 0
    ? providerData.totalCost / providerData.totalTokens * 1000
    : 0;

  // Include quality score
  const quality = calculateQualityScore(provider);

  return {
    provider,
    totalCost: providerData.totalCost,
    requests: providerData.requests,
    totalTokens: providerData.totalTokens,
    avgCostPerRequest,
    avgCostPerToken, // Cost per 1k tokens
    models: providerData.models,
    quality // { qualityScore, successRate, avgLatencyMs } or null
  };
}

/**
 * Compare two providers and determine if one is more cost-efficient.
 *
 * @param {Object} providerA - Metrics for provider A (current)
 * @param {Object} providerB - Metrics for provider B (suggested)
 * @returns {Object|null} Comparison result with recommendation
 */
function compareProviders(providerA, providerB) {
  if (!providerA || !providerB) return null;

  // Calculate cost difference
  const costDiffPerRequest = providerA.avgCostPerRequest - providerB.avgCostPerRequest;
  const costDiffPerToken = providerA.avgCostPerToken - providerB.avgCostPerToken;

  // Determine if savings are significant (>10% difference)
  const savingsPercentRequest = (costDiffPerRequest / providerA.avgCostPerRequest) * 100;
  const savingsPercentToken = (costDiffPerToken / providerA.avgCostPerToken) * 100;

  // Only recommend if savings are meaningful (>10%)
  if (savingsPercentRequest <= 10 && savingsPercentToken <= 10) {
    return null;
  }

  // Quality gate: Only recommend if suggested provider has comparable or better quality
  const qualityA = providerA.quality;
  const qualityB = providerB.quality;

  if (qualityA && qualityB) {
    // If suggested provider has significantly worse quality (>15 points lower), don't recommend
    // unless cost savings are very high (>50%)
    const qualityDiff = qualityB.qualityScore - qualityA.qualityScore;

    if (qualityDiff < -15 && savingsPercentRequest < 50) {
      return null; // Quality degradation too high for the cost savings
    }

    // If success rate is significantly lower (>10% lower), don't recommend
    if (qualityB.successRate < qualityA.successRate - 10) {
      return null; // Success rate too low
    }
  }

  return {
    currentProvider: providerA.provider,
    suggestedProvider: providerB.provider,
    savingsPerRequest: Math.abs(costDiffPerRequest),
    savingsPercent: Math.abs(savingsPercentRequest),
    currentCost: providerA.avgCostPerRequest,
    suggestedCost: providerB.avgCostPerRequest,
    estimatedMonthlySavings: calculateMonthlySavings(providerA, providerB),
    qualityComparison: qualityA && qualityB ? {
      currentQuality: qualityA.qualityScore,
      suggestedQuality: qualityB.qualityScore,
      currentSuccessRate: qualityA.successRate,
      suggestedSuccessRate: qualityB.successRate,
      currentLatency: qualityA.avgLatencyMs,
      suggestedLatency: qualityB.avgLatencyMs
    } : null
  };
}

/**
 * Estimate monthly savings based on historical usage.
 *
 * @param {Object} currentProvider - Current provider metrics
 * @param {Object} suggestedProvider - Suggested provider metrics
 * @returns {number} Estimated monthly savings in USD
 */
function calculateMonthlySavings(currentProvider, suggestedProvider) {
  // Estimate monthly requests based on current usage
  // Assume current data represents 1 month (will be refined in future)
  const monthlyRequests = currentProvider.requests;
  const costDiff = currentProvider.avgCostPerRequest - suggestedProvider.avgCostPerRequest;

  return Math.max(0, costDiff * monthlyRequests);
}

// ---- Recommendation Generation ----

/**
 * Generate cost optimization recommendations.
 *
 * Analyzes historical cost data and suggests cheaper alternatives
 * when quality/success rates are equivalent.
 *
 * @returns {Array} Array of recommendation objects
 */
export function getRecommendations() {
  const costsByProvider = costStore.getCostsByProvider();

  // Need at least 2 providers with data to make comparisons
  const providers = Object.keys(costsByProvider);
  if (providers.length < 2) {
    return [];
  }

  // Calculate efficiency metrics for each provider
  const metrics = [];
  for (const provider of providers) {
    const metric = calculateEfficiencyMetrics(costsByProvider[provider], provider);
    if (metric && metric.requests >= 5) { // Need at least 5 requests for reliable data
      metrics.push(metric);
    }
  }

  if (metrics.length < 2) {
    return [];
  }

  // Sort by avgCostPerRequest (ascending - cheapest first)
  metrics.sort((a, b) => a.avgCostPerRequest - b.avgCostPerRequest);

  const recommendations = [];

  // Compare each provider against the cheapest option
  const cheapest = metrics[0];

  for (let i = 1; i < metrics.length; i++) {
    const comparison = compareProviders(metrics[i], cheapest);

    if (comparison) {
      // Build description with quality info if available
      let description = `Save ${comparison.savingsPercent.toFixed(0)}% per request (${formatCurrency(comparison.savingsPerRequest)} per request)`;

      if (comparison.qualityComparison) {
        const qc = comparison.qualityComparison;
        if (qc.suggestedQuality >= qc.currentQuality) {
          description += ` with equal or better quality (${qc.suggestedSuccessRate}% success rate, ${qc.suggestedLatency}ms avg latency)`;
        } else {
          description += ` (quality: ${qc.currentQuality} → ${qc.suggestedQuality})`;
        }
      }

      recommendations.push({
        type: 'provider_switch',
        priority: comparison.savingsPercent > 40 ? 'high' : 'medium',
        title: `Switch from ${comparison.currentProvider} to ${comparison.suggestedProvider}`,
        description,
        impact: {
          savingsPerRequest: comparison.savingsPerRequest,
          savingsPercent: comparison.savingsPercent,
          estimatedMonthlySavings: comparison.estimatedMonthlySavings
        },
        currentProvider: comparison.currentProvider,
        suggestedProvider: comparison.suggestedProvider,
        quality: comparison.qualityComparison,
        confidence: calculateConfidence(metrics[i].requests)
      });
    }
  }

  // Add model-specific recommendations
  const modelRecommendations = generateModelRecommendations(costsByProvider);
  recommendations.push(...modelRecommendations);

  return recommendations;
}

/**
 * Generate model-specific optimization recommendations.
 *
 * @param {Object} costsByProvider - Cost data by provider
 * @returns {Array} Model-specific recommendations
 */
function generateModelRecommendations(costsByProvider) {
  const recommendations = [];

  for (const [provider, data] of Object.entries(costsByProvider)) {
    if (!data.models || Object.keys(data.models).length < 2) continue;

    // Find most and least expensive models for this provider
    const models = Object.entries(data.models).map(([model, stats]) => ({
      model,
      avgCost: stats.totalCost / stats.requests,
      ...stats
    }));

    models.sort((a, b) => b.avgCost - a.avgCost);

    if (models.length >= 2 && models[0].requests >= 3 && models[models.length - 1].requests >= 3) {
      const expensive = models[0];
      const cheap = models[models.length - 1];
      const savingsPercent = ((expensive.avgCost - cheap.avgCost) / expensive.avgCost) * 100;

      if (savingsPercent > 20) {
        recommendations.push({
          type: 'model_switch',
          priority: savingsPercent > 50 ? 'high' : 'medium',
          title: `Use ${cheap.model} instead of ${expensive.model} for ${provider}`,
          description: `Save ${savingsPercent.toFixed(0)}% by using a more efficient model`,
          impact: {
            savingsPerRequest: expensive.avgCost - cheap.avgCost,
            savingsPercent,
            estimatedMonthlySavings: (expensive.avgCost - cheap.avgCost) * expensive.requests
          },
          provider,
          currentModel: expensive.model,
          suggestedModel: cheap.model,
          confidence: calculateConfidence(Math.min(expensive.requests, cheap.requests))
        });
      }
    }
  }

  return recommendations;
}

/**
 * Calculate confidence score based on sample size.
 *
 * @param {number} requests - Number of requests in sample
 * @returns {string} Confidence level: 'high', 'medium', 'low'
 */
function calculateConfidence(requests) {
  if (requests >= 50) return 'high';
  if (requests >= 20) return 'medium';
  return 'low';
}

/**
 * Format currency value for display.
 *
 * @param {number} value - Value in USD
 * @returns {string} Formatted currency string
 */
function formatCurrency(value) {
  if (value >= 1) {
    return `$${value.toFixed(2)}`;
  }
  return `$${(value * 1000).toFixed(2)}m`; // Display as millicents for small values
}

// ---- Cost Projection ----

/**
 * Project future costs based on historical usage.
 *
 * @param {string} [provider] - Optional provider filter
 * @param {number} [days=30] - Number of days to project
 * @returns {Object} Cost projection
 */
export function projectCosts(provider = null, days = 30) {
  const costsByProvider = costStore.getCostsByProvider();
  const costData = costStore.readCostData();

  if (!costData.requests || costData.requests.length === 0) {
    return {
      projectedCost: 0,
      dailyAverage: 0,
      confidence: 'none'
    };
  }

  // Calculate date range of historical data
  const timestamps = costData.requests.map(r => new Date(r.timestamp).getTime());
  const minTime = Math.min(...timestamps);
  const maxTime = Math.max(...timestamps);
  const historicalDays = Math.max(1, (maxTime - minTime) / (1000 * 60 * 60 * 24));

  // Filter by provider if specified
  const relevantRequests = provider
    ? costData.requests.filter(r => r.provider === provider)
    : costData.requests;

  const totalCost = relevantRequests.reduce((sum, r) => sum + r.cost, 0);
  const dailyAverage = totalCost / historicalDays;
  const projectedCost = dailyAverage * days;

  return {
    projectedCost,
    dailyAverage,
    historicalDays,
    projectionDays: days,
    confidence: historicalDays >= 7 ? 'high' : historicalDays >= 3 ? 'medium' : 'low'
  };
}

// ---- Provider Comparison ----

/**
 * Get detailed cost comparison across all providers.
 *
 * @returns {Array} Array of provider comparison objects
 */
export function getProviderComparison() {
  const costsByProvider = costStore.getCostsByProvider();
  const providers = Object.keys(costsByProvider);

  if (providers.length === 0) {
    return [];
  }

  const comparisons = [];

  for (const provider of providers) {
    const metric = calculateEfficiencyMetrics(costsByProvider[provider], provider);
    if (metric) {
      const comparison = {
        provider: metric.provider,
        totalCost: metric.totalCost,
        requests: metric.requests,
        avgCostPerRequest: metric.avgCostPerRequest,
        avgCostPerToken: metric.avgCostPerToken,
        efficiency: calculateEfficiencyScore(metric)
      };

      // Include quality metrics if available
      if (metric.quality) {
        comparison.quality = {
          score: metric.quality.qualityScore,
          successRate: metric.quality.successRate,
          avgLatencyMs: metric.quality.avgLatencyMs
        };
      }

      comparisons.push(comparison);
    }
  }

  // Sort by efficiency score (higher is better)
  comparisons.sort((a, b) => b.efficiency - a.efficiency);

  return comparisons;
}

/**
 * Calculate efficiency score (0-100).
 * Higher score means better overall efficiency (cost + quality).
 *
 * @param {Object} metric - Provider metrics
 * @returns {number} Efficiency score
 */
function calculateEfficiencyScore(metric) {
  // Score based on cost per token (lower is better)
  // Normalize to 0-100 scale
  const maxReasonableCost = 0.1; // $0.10 per 1k tokens is expensive
  const minReasonableCost = 0.0001; // $0.0001 per 1k tokens is very cheap

  if (metric.avgCostPerToken === 0) return 50; // Neutral score

  const normalizedCost = Math.max(minReasonableCost, Math.min(maxReasonableCost, metric.avgCostPerToken));
  const costScore = 100 - ((normalizedCost - minReasonableCost) / (maxReasonableCost - minReasonableCost) * 100);

  // If quality data is available, combine cost score with quality score
  // Weight: 60% cost efficiency, 40% quality
  if (metric.quality && metric.quality.qualityScore !== undefined) {
    const combinedScore = (costScore * 0.6) + (metric.quality.qualityScore * 0.4);
    return Math.round(combinedScore);
  }

  return Math.round(costScore);
}

// ---- Export API ----

export default {
  getRecommendations,
  projectCosts,
  getProviderComparison
};
