import { z } from 'zod';
import {
  IsoDatetimeSchema,
  ProviderKeySchema,
  TaskTypeSchema,
  UnitIntervalSchema,
} from './runtime-schemas.js';

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
