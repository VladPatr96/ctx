import { z } from 'zod';

const IsoDatetimeSchema = z.string().datetime({ offset: true });

// ---------------------------------------------------------------------------
// Retrieval (from knowledge-continuity-schemas.js)
// ---------------------------------------------------------------------------

export const KnowledgeRetrievalMetadataSchema = z.object({
  strategy: z.literal('hybrid'),
  score: z.number().finite().nonnegative(),
  textScore: z.number().finite().nonnegative(),
  projectBoost: z.number().finite().nonnegative(),
  recencyBoost: z.number().finite().nonnegative(),
  accessBoost: z.number().finite().nonnegative(),
  matchReason: z.string().min(1),
}).strict();

export const KnowledgeRetrievalHitSchema = z.object({
  id: z.number().int().positive(),
  project: z.string(),
  category: z.string(),
  title: z.string(),
  body: z.string(),
  tags: z.string().optional(),
  source: z.string().optional(),
  github_url: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  access_count: z.number().optional(),
  retrieval: KnowledgeRetrievalMetadataSchema.optional(),
}).passthrough();

export const KnowledgeContinuitySuggestionSchema = z.object({
  type: z.enum(['resume', 'decision', 'error', 'search']),
  title: z.string().min(1),
  description: z.string().min(1),
  entryId: z.number().int().positive().nullable().default(null),
}).strict();

export const KnowledgeContinuitySnapshotSchema = z.object({
  exists: z.boolean(),
  createdAt: IsoDatetimeSchema.nullable(),
  branch: z.string().nullable(),
  task: z.string().nullable(),
  stage: z.string().nullable(),
}).strict();

export const KnowledgeContinuityDigestSchema = z.object({
  generatedAt: IsoDatetimeSchema,
  project: z.string().min(1),
  snapshot: KnowledgeContinuitySnapshotSchema,
  stats: z.object({
    totalEntries: z.number().int().nonnegative(),
    sessions: z.number().int().nonnegative(),
    decisions: z.number().int().nonnegative(),
    errors: z.number().int().nonnegative(),
  }).strict(),
  recentSessions: z.array(KnowledgeRetrievalHitSchema),
  recentDecisions: z.array(KnowledgeRetrievalHitSchema),
  recentErrors: z.array(KnowledgeRetrievalHitSchema),
  suggestions: z.array(KnowledgeContinuitySuggestionSchema),
}).strict();

export function createKnowledgeRetrievalHit(input) {
  return KnowledgeRetrievalHitSchema.parse(input);
}

export function createKnowledgeContinuityDigest(input) {
  return KnowledgeContinuityDigestSchema.parse(input);
}

// ---------------------------------------------------------------------------
// Quality (from knowledge-quality-schemas.js)
// ---------------------------------------------------------------------------

export const KnowledgeCategoryCoverageSchema = z.object({
  category: z.string().min(1),
  count: z.number().int().nonnegative(),
}).strict();

export const KnowledgeQualityGapSchema = z.object({
  type: z.enum(['snapshot_missing', 'session_missing', 'stale_archive']),
  project: z.string().min(1),
  description: z.string().min(1),
}).strict();

export const KnowledgeProjectHealthSchema = z.object({
  project: z.string().min(1),
  totalEntries: z.number().int().nonnegative(),
  lastUpdatedAt: IsoDatetimeSchema.nullable(),
  snapshotExists: z.boolean(),
  snapshotUpdatedAt: IsoDatetimeSchema.nullable(),
  staleEntries: z.number().int().nonnegative(),
  sessionEntries: z.number().int().nonnegative(),
  decisionEntries: z.number().int().nonnegative(),
  errorEntries: z.number().int().nonnegative(),
  categories: z.array(z.string().min(1)),
}).strict();

export const KnowledgeQualitySummarySchema = z.object({
  generatedAt: IsoDatetimeSchema,
  staleAfterDays: z.number().int().positive(),
  totals: z.object({
    totalEntries: z.number().int().nonnegative(),
    totalProjects: z.number().int().nonnegative(),
    snapshotProjects: z.number().int().nonnegative(),
    staleEntries: z.number().int().nonnegative(),
  }).strict(),
  categoryCoverage: z.array(KnowledgeCategoryCoverageSchema),
  projects: z.array(KnowledgeProjectHealthSchema),
  gaps: z.array(KnowledgeQualityGapSchema),
}).strict();

export const KnowledgeExportSectionSchema = z.object({
  category: z.string().min(1),
  count: z.number().int().nonnegative(),
  entries: z.array(KnowledgeRetrievalHitSchema),
}).strict();

export const KnowledgeProjectExportSchema = z.object({
  generatedAt: IsoDatetimeSchema,
  project: z.string().min(1),
  staleAfterDays: z.number().int().positive(),
  snapshot: KnowledgeContinuitySnapshotSchema,
  continuity: KnowledgeContinuityDigestSchema,
  quality: z.object({
    totalEntries: z.number().int().nonnegative(),
    staleEntries: z.number().int().nonnegative(),
    lastUpdatedAt: IsoDatetimeSchema.nullable(),
    categories: z.array(z.string().min(1)),
  }).strict(),
  sections: z.array(KnowledgeExportSectionSchema),
}).strict();

export function createKnowledgeQualitySummary(input) {
  return KnowledgeQualitySummarySchema.parse(input);
}

export function createKnowledgeProjectExport(input) {
  return KnowledgeProjectExportSchema.parse(input);
}

// ---------------------------------------------------------------------------
// Suggestions (from knowledge-suggestion-schemas.js)
// ---------------------------------------------------------------------------

export const KnowledgeSuggestionRecordSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  action: z.enum(['resume_context', 'review_decision', 'triage_error', 'capture_session']),
  sourceEntryIds: z.array(z.number().int().positive()),
}).strict();

export const KnowledgeTemplateRecordSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  prompt: z.string().min(1),
  sourceCategories: z.array(z.string().min(1)),
  sourceEntryIds: z.array(z.number().int().positive()),
}).strict();

export const KnowledgeSuggestionSummarySchema = z.object({
  generatedAt: IsoDatetimeSchema,
  project: z.string().min(1),
  exportArtifact: KnowledgeProjectExportSchema,
  suggestions: z.array(KnowledgeSuggestionRecordSchema),
  templates: z.array(KnowledgeTemplateRecordSchema),
}).strict();

export function createKnowledgeSuggestionSummary(input) {
  return KnowledgeSuggestionSummarySchema.parse(input);
}
