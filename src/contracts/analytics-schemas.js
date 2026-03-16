import { z } from 'zod';

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
