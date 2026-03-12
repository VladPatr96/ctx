import { z } from 'zod';
import {
  KnowledgeContinuityDigestSchema,
  KnowledgeContinuitySnapshotSchema,
  KnowledgeRetrievalHitSchema,
} from './knowledge-continuity-schemas.js';

const IsoDatetimeSchema = z.string().datetime({ offset: true });

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
