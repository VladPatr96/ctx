import { z } from 'zod';

export const DocsSourceTypeSchema = z.enum(['root', 'docs', 'skills', 'agents']);
export const DocsStatusSchema = z.enum(['canonical', 'migrate', 'source_material']);
export const DocsCategorySchema = z.enum([
  'overview',
  'setup',
  'workflow',
  'architecture',
  'research',
  'testing',
  'skills',
  'agents',
  'release',
  'migration',
  'reference',
  'planning',
  'archive',
]);
export const DocsAudienceSchema = z.enum(['user', 'operator', 'contributor', 'internal']);

export const DocsSurfaceSchema = z.object({
  path: z.string().min(1),
  sourceType: DocsSourceTypeSchema,
  status: DocsStatusSchema,
  category: DocsCategorySchema,
  audience: DocsAudienceSchema,
  targetSurface: z.string().min(1),
  notes: z.array(z.string()).default([]),
}).strict();

export const DocsInventorySummarySchema = z.object({
  total: z.number().int().nonnegative(),
  byStatus: z.record(DocsStatusSchema, z.number().int().nonnegative()).default({}),
  byCategory: z.record(DocsCategorySchema, z.number().int().nonnegative()).default({}),
  bySourceType: z.record(DocsSourceTypeSchema, z.number().int().nonnegative()).default({}),
}).strict();

export const DocsInventorySchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  project: z.string().min(1),
  entries: z.array(DocsSurfaceSchema),
  summary: DocsInventorySummarySchema,
}).strict();

export function parseDocsInventory(input) {
  return DocsInventorySchema.parse(input);
}

export function createDocsInventory({ generatedAt, project, entries }) {
  const normalizedEntries = entries.map((entry) => DocsSurfaceSchema.parse(entry));
  return parseDocsInventory({
    generatedAt,
    project,
    entries: normalizedEntries,
    summary: {
      total: normalizedEntries.length,
      byStatus: countBy(normalizedEntries, 'status'),
      byCategory: countBy(normalizedEntries, 'category'),
      bySourceType: countBy(normalizedEntries, 'sourceType'),
    },
  });
}

function countBy(entries, field) {
  return entries.reduce((acc, entry) => {
    const key = entry[field];
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}
