import { z } from 'zod';
import {
  IsoDatetimeSchema,
  ProviderKeySchema,
  TaskTypeSchema,
  UnitIntervalSchema,
} from './runtime-schemas.js';

export const AnalyticsQualitySchema = z.object({
  score: z.number().int().min(0).max(100),
  successRate: z.number().min(0).max(100),
  avgLatencyMs: z.number().nonnegative(),
  calls: z.number().int().nonnegative(),
}).strict();

export const AnalyticsBudgetEntrySchema = z.object({
  scope: z.enum(['global', 'provider', 'session', 'project']),
  key: z.string().nullable().default(null),
  status: z.string(),
  budget: z.number().nonnegative(),
  currentCost: z.number().nonnegative(),
  remaining: z.number().nonnegative(),
  percentUsed: z.number().nonnegative(),
  alert: z.string().nullable().default(null),
}).strict();

export const AnalyticsModelCardSchema = z.object({
  model: z.string().min(1),
  totalCost: z.number().nonnegative(),
  requests: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  avgCostPerRequest: z.number().nonnegative(),
  avgCostPer1kTokens: z.number().nonnegative(),
}).strict();

export const AnalyticsProviderCardSchema = z.object({
  provider: z.string().min(1),
  totalCost: z.number().nonnegative(),
  requests: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  avgCostPerRequest: z.number().nonnegative(),
  avgCostPer1kTokens: z.number().nonnegative(),
  efficiencyScore: z.number().int().min(0).max(100).nullable().default(null),
  quality: AnalyticsQualitySchema.nullable().default(null),
  budget: AnalyticsBudgetEntrySchema.nullable().default(null),
  models: z.array(AnalyticsModelCardSchema).default([]),
}).strict();

export const AnalyticsTrendPointSchema = z.object({
  bucketStart: z.string().datetime({ offset: true }),
  label: z.string().min(1),
  totalCost: z.number().nonnegative(),
  requests: z.number().int().nonnegative(),
  providers: z.record(z.number().nonnegative()).default({}),
}).strict();

export const AnalyticsTimelineSchema = z.object({
  granularity: z.literal('day'),
  days: z.number().int().positive(),
  points: z.array(AnalyticsTrendPointSchema),
}).strict();

export const AnalyticsRecommendationSchema = z.object({
  type: z.string().min(1),
  priority: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  confidence: z.string().nullable().default(null),
  currentProvider: z.string().nullable().default(null),
  suggestedProvider: z.string().nullable().default(null),
  currentModel: z.string().nullable().default(null),
  suggestedModel: z.string().nullable().default(null),
  impact: z.object({
    savingsPerRequest: z.number().nonnegative().default(0),
    savingsPercent: z.number().nonnegative().default(0),
    estimatedMonthlySavings: z.number().nonnegative().default(0),
  }).strict(),
}).strict();

export const AnalyticsRoutingSnapshotSchema = z.object({
  available: z.boolean(),
  totalDecisions: z.number().int().nonnegative(),
  anomalyCount: z.number().int().nonnegative(),
  divergedCount: z.number().int().nonnegative(),
  dominantProvider: z.string().nullable().default(null),
  lastDecisionAt: z.string().nullable().default(null),
}).strict();

export const AnalyticsTotalsSchema = z.object({
  totalCost: z.number().nonnegative(),
  totalRequests: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  providerCount: z.number().int().nonnegative(),
  costPerRequest: z.number().nonnegative(),
  projectedMonthlyCost: z.number().nonnegative(),
  projectionConfidence: z.enum(['high', 'medium', 'low', 'none']),
}).strict();

export const AnalyticsBudgetSummarySchema = z.object({
  hasAlerts: z.boolean(),
  thresholds: z.object({
    warning: z.number().nonnegative(),
    critical: z.number().nonnegative(),
  }).strict(),
  global: AnalyticsBudgetEntrySchema.nullable().default(null),
  providers: z.array(AnalyticsBudgetEntrySchema).default([]),
}).strict();

export const AnalyticsSummarySchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  totals: AnalyticsTotalsSchema,
  providers: z.array(AnalyticsProviderCardSchema),
  timeline: AnalyticsTimelineSchema,
  recommendations: z.array(AnalyticsRecommendationSchema),
  budget: AnalyticsBudgetSummarySchema,
  routing: AnalyticsRoutingSnapshotSchema,
  gaps: z.array(z.string()).default([]),
}).strict();

export function parseAnalyticsSummary(input) {
  return AnalyticsSummarySchema.parse(input);
}

export function createAnalyticsSummary(input) {
  const providers = (input.providers || []).map((entry) => AnalyticsProviderCardSchema.parse(entry));
  const recommendations = (input.recommendations || []).map((entry) => AnalyticsRecommendationSchema.parse(entry));
  const budgetProviders = (input.budget?.providers || []).map((entry) => AnalyticsBudgetEntrySchema.parse(entry));

  return parseAnalyticsSummary({
    generatedAt: input.generatedAt,
    totals: AnalyticsTotalsSchema.parse(input.totals),
    providers,
    timeline: AnalyticsTimelineSchema.parse(input.timeline),
    recommendations,
    budget: {
      hasAlerts: input.budget?.hasAlerts === true,
      thresholds: input.budget?.thresholds,
      global: input.budget?.global ? AnalyticsBudgetEntrySchema.parse(input.budget.global) : null,
      providers: budgetProviders,
    },
    routing: AnalyticsRoutingSnapshotSchema.parse(input.routing),
    gaps: Array.isArray(input.gaps) ? input.gaps.filter((entry) => typeof entry === 'string' && entry.trim()) : [],
  });
}

// ---------------------------------------------------------------------------
// Routing Feedback Schemas (merged from routing-feedback-schemas.js)
// ---------------------------------------------------------------------------

export const RoutingFeedbackVerdictSchema = z.enum(['positive', 'neutral', 'negative']);

export const RoutingFeedbackPayloadSchema = z.object({
  decisionId: z.number().int().positive(),
  provider: ProviderKeySchema.optional(),
  taskType: TaskTypeSchema.optional(),
  verdict: RoutingFeedbackVerdictSchema,
  note: z.string().trim().max(280).optional(),
  actor: z.string().trim().min(1).max(80).optional(),
}).strict();

export const RoutingFeedbackRecordSchema = z.object({
  id: z.number().int().positive(),
  decisionId: z.number().int().positive(),
  provider: ProviderKeySchema,
  taskType: TaskTypeSchema,
  verdict: RoutingFeedbackVerdictSchema,
  note: z.string().nullable(),
  actor: z.string(),
  createdAt: IsoDatetimeSchema,
}).strict();

export const RoutingDecisionFeedbackSummarySchema = z.object({
  verdict: z.enum(['positive', 'neutral', 'negative', 'unrated']),
  total: z.number().int().nonnegative(),
  positive: z.number().int().nonnegative(),
  neutral: z.number().int().nonnegative(),
  negative: z.number().int().nonnegative(),
  note: z.string().nullable(),
  lastSubmittedAt: IsoDatetimeSchema.nullable(),
}).strict();

export const RoutingProviderFeedbackSchema = z.object({
  provider: ProviderKeySchema,
  total: z.number().int().nonnegative(),
  positive: z.number().int().nonnegative(),
  neutral: z.number().int().nonnegative(),
  negative: z.number().int().nonnegative(),
  score: UnitIntervalSchema,
}).strict();

export const RoutingExplainabilityDecisionSchema = z.object({
  id: z.number().int().positive().nullable(),
  timestamp: IsoDatetimeSchema,
  taskType: TaskTypeSchema,
  selectedProvider: ProviderKeySchema,
  runnerUp: ProviderKeySchema.nullable(),
  routingMode: z.enum(['static', 'adaptive', 'override']),
  finalScore: UnitIntervalSchema,
  scoreMargin: z.number().finite().nullable(),
  diverged: z.boolean(),
  contributions: z.object({
    static: UnitIntervalSchema,
    evaluation: UnitIntervalSchema,
    feedback: UnitIntervalSchema,
    exploration: UnitIntervalSchema,
  }).strict(),
  explanation: z.object({
    headline: z.string().min(1),
    summary: z.string().min(1),
    factors: z.array(z.string()).default([]),
  }).strict(),
  feedback: RoutingDecisionFeedbackSummarySchema,
}).strict();

export const RoutingExplainabilitySummarySchema = z.object({
  generatedAt: IsoDatetimeSchema,
  mode: z.enum(['static', 'adaptive', 'config_off', 'forced_off']),
  readiness: z.object({
    totalRuns: z.number().int().nonnegative(),
    isReady: z.boolean(),
    alpha: UnitIntervalSchema,
    adaptiveEnabled: z.boolean(),
  }).strict(),
  totals: z.object({
    totalDecisions: z.number().int().nonnegative(),
    decisionCount: z.number().int().nonnegative(),
    feedbackCount: z.number().int().nonnegative(),
    negativeFeedbackCount: z.number().int().nonnegative(),
  }).strict(),
  anomalies: z.array(z.object({
    type: z.string(),
    severity: z.string(),
    message: z.string(),
  }).strict()),
  distribution: z.array(z.object({
    selected_provider: ProviderKeySchema,
    cnt: z.number().int().nonnegative(),
  }).strict()),
  decisions: z.array(RoutingExplainabilityDecisionSchema),
  feedback: z.object({
    total: z.number().int().nonnegative(),
    positive: z.number().int().nonnegative(),
    neutral: z.number().int().nonnegative(),
    negative: z.number().int().nonnegative(),
    byProvider: z.array(RoutingProviderFeedbackSchema),
  }).strict(),
}).strict();

export function parseRoutingFeedbackPayload(input) {
  return RoutingFeedbackPayloadSchema.parse(input);
}

export function createRoutingFeedbackRecord(input) {
  return RoutingFeedbackRecordSchema.parse(input);
}

export function createRoutingExplainabilitySummary(input) {
  return RoutingExplainabilitySummarySchema.parse(input);
}
