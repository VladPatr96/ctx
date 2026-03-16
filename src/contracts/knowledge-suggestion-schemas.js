import { z } from 'zod';
import { KnowledgeProjectExportSchema } from './knowledge-quality-schemas.js';

const IsoDatetimeSchema = z.string().datetime({ offset: true });

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
