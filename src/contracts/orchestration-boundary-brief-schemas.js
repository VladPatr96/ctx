import { z } from 'zod';

export const OrchestrationConcernIdSchema = z.enum([
  'decomposition',
  'branching',
  'batch_execution',
  'programmable_pipeline_builder',
]);

export const OrchestrationConcernSchema = z.object({
  id: OrchestrationConcernIdSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  currentPosition: z.string().min(1),
  coreBoundary: z.array(z.string().min(1)).min(2),
  deferredProductSurface: z.array(z.string().min(1)).min(2),
  risks: z.array(z.string().min(1)).min(2),
}).strict();

export const OrchestrationExecutionBoundarySchema = z.object({
  coreRuntimeResponsibilities: z.array(z.string().min(1)).min(3),
  deferredProductSurfaces: z.array(z.string().min(1)).min(3),
  preconditions: z.array(z.string().min(1)).min(3),
}).strict();

export const OrchestrationBoundaryBriefSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  title: z.string().min(1),
  thesis: z.string().min(1),
  concernMap: z.array(OrchestrationConcernSchema).min(4),
  executionBoundary: OrchestrationExecutionBoundarySchema,
  rolloutGuards: z.array(z.string().min(1)).min(4),
  nonGoals: z.array(z.string().min(1)).min(4),
}).strict();

export function parseOrchestrationBoundaryBrief(input) {
  return OrchestrationBoundaryBriefSchema.parse(input);
}

export function createOrchestrationBoundaryBrief({
  generatedAt,
  title,
  thesis,
  concernMap,
  executionBoundary,
  rolloutGuards,
  nonGoals,
}) {
  return parseOrchestrationBoundaryBrief({
    generatedAt,
    title,
    thesis,
    concernMap,
    executionBoundary,
    rolloutGuards,
    nonGoals,
  });
}
