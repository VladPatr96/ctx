import { z } from 'zod';

const IsoDatetimeSchema = z.string().datetime({ offset: true });

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
