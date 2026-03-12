import { createAnalyticsSummary } from '../contracts/analytics-schemas.js';
import { createCostStore } from '../cost-tracking/cost-store.js';
import { getBudgetConfig, checkAllBudgets } from '../cost-tracking/budget-alerts.js';
import { getProviderComparison, getRecommendations, projectCosts } from '../cost-tracking/optimization-engine.js';
import { resolveDataDir } from '../storage/index.js';
import { detectAnomalies } from '../evaluation/routing-anomaly.js';

export async function buildAnalyticsSummary({
  dataDir = resolveDataDir(),
  now = new Date().toISOString(),
  evalStore = null,
  routingWindow = { last: 50, sinceDays: 7 },
} = {}) {
  const generatedAt = new Date(now).toISOString();
  const costStore = createCostStore({ dataDir });
  const costSummary = costStore.getCostSummary();
  const costData = costStore.readCostData();
  const providerComparison = getProviderComparison({ dataDir });
  const recommendations = getRecommendations({ dataDir });
  const projection = projectCosts(null, 30, { dataDir });
  const budgetConfig = getBudgetConfig({ dataDir });
  const budgetStatus = checkAllBudgets({
    total: costSummary.totalCost || 0,
    byProvider: costSummary.byProvider || {},
  }, { dataDir });
  const routingSnapshot = await buildRoutingSnapshot(evalStore, routingWindow);

  const providerBudgetMap = new Map(
    Object.entries(budgetStatus.providers || {}).map(([provider, entry]) => [provider, normalizeBudgetEntry(entry, 'provider', provider)])
  );
  const comparisonMap = new Map(
    providerComparison.map((entry) => [entry.provider, entry])
  );

  const providers = Object.entries(costSummary.byProvider || {})
    .map(([provider, stats]) => buildProviderCard(provider, stats, comparisonMap.get(provider), providerBudgetMap.get(provider)))
    .sort((left, right) => right.totalCost - left.totalCost || left.provider.localeCompare(right.provider));

  const gaps = [];
  if (!routingSnapshot.available) {
    gaps.push('Routing analytics snapshot is unavailable until the eval store is ready.');
  }

  return createAnalyticsSummary({
    generatedAt,
    totals: {
      totalCost: normalizeCurrency(costSummary.totalCost),
      totalRequests: normalizeCount(costSummary.totalRequests),
      totalTokens: providers.reduce((sum, provider) => sum + provider.totalTokens, 0),
      providerCount: providers.length,
      costPerRequest: costPerRequest(costSummary.totalCost, costSummary.totalRequests),
      projectedMonthlyCost: normalizeCurrency(projection.projectedCost || 0),
      projectionConfidence: normalizeProjectionConfidence(projection.confidence),
    },
    providers,
    timeline: buildTimeline(costData.requests || [], generatedAt),
    recommendations: recommendations.map(normalizeRecommendation),
    budget: {
      hasAlerts: budgetStatus.hasAlerts === true,
      thresholds: {
        warning: Number(budgetConfig.thresholds?.warning ?? 0.8),
        critical: Number(budgetConfig.thresholds?.critical ?? 0.95),
      },
      global: budgetStatus.global ? normalizeBudgetEntry(budgetStatus.global, 'global', null) : null,
      providers: [...providerBudgetMap.values()].sort((left, right) => left.key.localeCompare(right.key)),
    },
    routing: routingSnapshot,
    gaps,
  });
}

async function buildRoutingSnapshot(evalStore, routingWindow) {
  if (!evalStore || typeof evalStore.getRoutingHealth !== 'function') {
    return {
      available: false,
      totalDecisions: 0,
      anomalyCount: 0,
      divergedCount: 0,
      dominantProvider: null,
      lastDecisionAt: null,
    };
  }

  const health = evalStore.getRoutingHealth(routingWindow);
  const anomalies = detectAnomalies(health.anomalyStats, health.distribution, health.total);
  const dominantProvider = Array.isArray(health.distribution) && health.distribution.length > 0
    ? [...health.distribution].sort((left, right) => right.cnt - left.cnt)[0].selected_provider
    : null;
  const lastDecisionAt = Array.isArray(health.decisions) && health.decisions.length > 0
    ? String(health.decisions[health.decisions.length - 1].timestamp || health.decisions[0].timestamp || '')
    : null;

  return {
    available: true,
    totalDecisions: normalizeCount(health.total),
    anomalyCount: anomalies.length,
    divergedCount: normalizeCount(health.anomalyStats?.diverged_count),
    dominantProvider,
    lastDecisionAt: lastDecisionAt || null,
  };
}

function buildProviderCard(provider, stats, comparison, budgetEntry) {
  const models = Object.entries(stats.models || {})
    .map(([model, modelStats]) => {
      const totalCost = normalizeCurrency(modelStats.totalCost);
      const requests = normalizeCount(modelStats.requests);
      const totalTokens = normalizeCount(modelStats.totalTokens);
      return {
        model,
        totalCost,
        requests,
        totalTokens,
        avgCostPerRequest: costPerRequest(totalCost, requests),
        avgCostPer1kTokens: costPer1kTokens(totalCost, totalTokens),
      };
    })
    .sort((left, right) => right.totalCost - left.totalCost || left.model.localeCompare(right.model));

  return {
    provider,
    totalCost: normalizeCurrency(stats.totalCost),
    requests: normalizeCount(stats.requests),
    totalTokens: normalizeCount(stats.totalTokens),
    avgCostPerRequest: costPerRequest(stats.totalCost, stats.requests),
    avgCostPer1kTokens: costPer1kTokens(stats.totalCost, stats.totalTokens),
    efficiencyScore: Number.isFinite(comparison?.efficiency) ? Math.round(comparison.efficiency) : null,
    quality: normalizeQuality(comparison?.quality),
    budget: budgetEntry || null,
    models,
  };
}

function buildTimeline(requests, nowIso, days = 7) {
  const buckets = [];
  const bucketIndex = new Map();
  const endDate = new Date(nowIso);
  endDate.setUTCHours(0, 0, 0, 0);

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const bucketStart = new Date(endDate);
    bucketStart.setUTCDate(bucketStart.getUTCDate() - offset);
    const iso = bucketStart.toISOString();
    const point = {
      bucketStart: iso,
      label: iso.slice(5, 10),
      totalCost: 0,
      requests: 0,
      providers: {},
    };
    buckets.push(point);
    bucketIndex.set(iso.slice(0, 10), point);
  }

  for (const request of requests) {
    const timestamp = String(request.timestamp || '');
    const key = timestamp.slice(0, 10);
    const bucket = bucketIndex.get(key);
    if (!bucket) continue;
    const provider = typeof request.provider === 'string' && request.provider.trim()
      ? request.provider.trim()
      : 'unknown';
    const cost = normalizeCurrency(request.cost);
    bucket.totalCost = normalizeCurrency(bucket.totalCost + cost);
    bucket.requests += 1;
    bucket.providers[provider] = normalizeCurrency((bucket.providers[provider] || 0) + cost);
  }

  return {
    granularity: 'day',
    days,
    points: buckets,
  };
}

function normalizeRecommendation(recommendation) {
  const impact = recommendation?.impact || {};
  return {
    type: normalizeString(recommendation?.type, 'unknown'),
    priority: normalizeString(recommendation?.priority, 'medium'),
    title: normalizeString(recommendation?.title, 'Recommendation'),
    description: normalizeString(recommendation?.description, ''),
    confidence: normalizeNullableString(recommendation?.confidence),
    currentProvider: normalizeNullableString(recommendation?.currentProvider),
    suggestedProvider: normalizeNullableString(recommendation?.suggestedProvider),
    currentModel: normalizeNullableString(recommendation?.currentModel),
    suggestedModel: normalizeNullableString(recommendation?.suggestedModel),
    impact: {
      savingsPerRequest: normalizeCurrency(impact.savingsPerRequest),
      savingsPercent: normalizeNumber(impact.savingsPercent),
      estimatedMonthlySavings: normalizeCurrency(impact.estimatedMonthlySavings),
    },
  };
}

function normalizeBudgetEntry(entry, scope, key) {
  return {
    scope,
    key: key == null ? null : String(key),
    status: normalizeString(entry?.status, 'ok'),
    budget: normalizeCurrency(entry?.budget),
    currentCost: normalizeCurrency(entry?.currentCost),
    remaining: normalizeCurrency(entry?.remaining),
    percentUsed: normalizeNumber(entry?.percentUsed),
    alert: normalizeNullableString(entry?.alert),
  };
}

function normalizeQuality(quality) {
  if (!quality || !Number.isFinite(quality.score)) {
    return null;
  }
  return {
    score: Math.round(quality.score),
    successRate: normalizeNumber(quality.successRate),
    avgLatencyMs: normalizeNumber(quality.avgLatencyMs),
    calls: normalizeCount(quality.calls),
  };
}

function costPerRequest(totalCost, requests) {
  const normalizedRequests = normalizeCount(requests);
  if (normalizedRequests <= 0) return 0;
  return normalizeCurrency(totalCost / normalizedRequests);
}

function costPer1kTokens(totalCost, totalTokens) {
  const normalizedTokens = normalizeCount(totalTokens);
  if (normalizedTokens <= 0) return 0;
  return normalizeCurrency((totalCost / normalizedTokens) * 1000);
}

function normalizeProjectionConfidence(value) {
  return value === 'high' || value === 'medium' || value === 'low' ? value : 'none';
}

function normalizeCount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : 0;
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function normalizeCurrency(value) {
  return Number(normalizeNumber(value).toFixed(6));
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeNullableString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
