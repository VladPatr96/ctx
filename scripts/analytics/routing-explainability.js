import { join } from 'node:path';
import { normalizeRoutingConfig } from '../contracts/config-schemas.js';
import { createRoutingExplainabilitySummary } from '../contracts/routing-feedback-schemas.js';
import { detectAnomalies } from '../evaluation/routing-anomaly.js';
import { resolveDataDir } from '../storage/index.js';
import { readJsonFile } from '../utils/state-io.js';

export async function buildRoutingExplainability({
  evalStore,
  dataDir = resolveDataDir(),
  now = new Date().toISOString(),
  last = 20,
  sinceDays = 7,
} = {}) {
  const readiness = getReadiness(evalStore);
  const mode = getRoutingMode(readRoutingConfig(dataDir), readiness);
  const health = getRoutingHealth(evalStore, { last, sinceDays });
  const anomalies = detectAnomalies(health.anomalyStats, health.distribution, health.total);
  const feedback = getFeedbackSummary(evalStore, sinceDays, health.decisions);

  return createRoutingExplainabilitySummary({
    generatedAt: now,
    mode,
    readiness,
    totals: {
      totalDecisions: health.total,
      decisionCount: health.decisions.length,
      feedbackCount: feedback.total,
      negativeFeedbackCount: feedback.negative,
    },
    anomalies,
    distribution: health.distribution,
    decisions: health.decisions.map((decision) =>
      normalizeDecision(decision, feedback.byDecision?.[decision.id] || null)
    ),
    feedback: {
      total: feedback.total,
      positive: feedback.positive,
      neutral: feedback.neutral,
      negative: feedback.negative,
      byProvider: feedback.byProvider || [],
    },
  });
}

function getReadiness(evalStore) {
  if (!evalStore || typeof evalStore.getReadiness !== 'function') {
    return { totalRuns: 0, isReady: false, alpha: 0, adaptiveEnabled: false };
  }
  try {
    return evalStore.getReadiness();
  } catch {
    return { totalRuns: 0, isReady: false, alpha: 0, adaptiveEnabled: false };
  }
}

function getRoutingHealth(evalStore, options) {
  if (!evalStore || typeof evalStore.getRoutingHealth !== 'function') {
    return { total: 0, decisions: [], distribution: [], anomalyStats: {} };
  }
  try {
    return evalStore.getRoutingHealth(options);
  } catch {
    return { total: 0, decisions: [], distribution: [], anomalyStats: {} };
  }
}

function getFeedbackSummary(evalStore, sinceDays, decisions) {
  if (!evalStore || typeof evalStore.getRoutingFeedbackSummary !== 'function') {
    return { total: 0, positive: 0, neutral: 0, negative: 0, byProvider: [], byDecision: {} };
  }
  try {
    return evalStore.getRoutingFeedbackSummary({
      sinceDays,
      decisionIds: decisions.map((entry) => entry.id).filter((value) => Number.isInteger(value)),
    });
  } catch {
    return { total: 0, positive: 0, neutral: 0, negative: 0, byProvider: [], byDecision: {} };
  }
}

function readRoutingConfig(dataDir) {
  const path = join(dataDir, 'routing-config.json');
  return normalizeRoutingConfig(readJsonFile(path, {}));
}

function getRoutingMode(config, readiness) {
  if (process.env.CTX_ADAPTIVE_ROUTING === '0') return 'forced_off';
  if (config.enabled === false) return 'config_off';
  return readiness.adaptiveEnabled ? 'adaptive' : 'static';
}

function normalizeDecision(decision, feedbackSummary) {
  const contributions = {
    static: clampScore(decision.static_component),
    evaluation: clampScore(decision.eval_component),
    feedback: clampScore(decision.feedback_component),
    exploration: clampScore(decision.explore_component),
  };
  const explanation = buildExplanation(decision, feedbackSummary, contributions);

  return {
    id: decision.id ?? null,
    timestamp: decision.timestamp,
    taskType: decision.task_type,
    selectedProvider: decision.selected_provider,
    runnerUp: decision.runner_up ?? null,
    routingMode: decision.routing_mode,
    finalScore: clampScore(decision.final_score),
    scoreMargin: typeof decision.delta === 'number' ? decision.delta : null,
    diverged: Boolean(decision.is_diverged),
    contributions,
    explanation,
    feedback: normalizeFeedbackSummary(feedbackSummary),
  };
}

function normalizeFeedbackSummary(summary) {
  if (!summary) {
    return {
      verdict: 'unrated',
      total: 0,
      positive: 0,
      neutral: 0,
      negative: 0,
      note: null,
      lastSubmittedAt: null,
    };
  }
  return {
    verdict: summary.verdict || 'unrated',
    total: summary.total || 0,
    positive: summary.positive || 0,
    neutral: summary.neutral || 0,
    negative: summary.negative || 0,
    note: summary.note ?? null,
    lastSubmittedAt: summary.lastSubmittedAt ?? null,
  };
}

function buildExplanation(decision, feedbackSummary, contributions) {
  const factors = [];
  const provider = decision.selected_provider;
  const taskType = decision.task_type;
  const mode = decision.routing_mode;

  if (mode === 'override') {
    factors.push(`Manual override forced ${provider} for ${taskType}.`);
  } else if (mode === 'adaptive') {
    const leader = dominantContribution(contributions);
    factors.push(`Adaptive routing selected ${provider} for ${taskType}.`);
    factors.push(`Primary score driver was ${leader.label} (${leader.value.toFixed(3)}).`);
    if (decision.delta != null) {
      factors.push(`Score margin over the runner-up was ${decision.delta.toFixed(3)}.`);
    }
    if (decision.is_diverged) {
      factors.push('Selection diverged from the static default based on runtime evidence.');
    }
  } else {
    factors.push(`Static routing matched ${taskType} to ${provider}.`);
    if (decision.delta != null) {
      factors.push(`Decision margin over fallback candidate was ${decision.delta.toFixed(3)}.`);
    }
  }

  if ((decision.feedback_component || 0) > 0) {
    factors.push(`Operator feedback contributed ${(decision.feedback_component || 0).toFixed(3)} to the final score.`);
  }

  if (feedbackSummary?.total > 0) {
    factors.push(`Recent operator verdict: ${feedbackSummary.verdict} (${feedbackSummary.total} feedback event${feedbackSummary.total === 1 ? '' : 's'}).`);
  }

  return {
    headline: buildHeadline(mode, provider, taskType, feedbackSummary),
    summary: factors[0],
    factors,
  };
}

function buildHeadline(mode, provider, taskType, feedbackSummary) {
  const feedbackLabel = feedbackSummary?.verdict && feedbackSummary.verdict !== 'unrated'
    ? `, feedback ${feedbackSummary.verdict}`
    : '';
  if (mode === 'override') {
    return `${provider} forced by override for ${taskType}${feedbackLabel}`;
  }
  if (mode === 'adaptive') {
    return `${provider} selected adaptively for ${taskType}${feedbackLabel}`;
  }
  return `${provider} selected by static routing for ${taskType}${feedbackLabel}`;
}

function dominantContribution(contributions) {
  const entries = [
    { label: 'static match', value: contributions.static },
    { label: 'evaluation evidence', value: contributions.evaluation },
    { label: 'operator feedback', value: contributions.feedback },
    { label: 'exploration bonus', value: contributions.exploration },
  ];
  entries.sort((a, b) => b.value - a.value);
  return entries[0];
}

function clampScore(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
