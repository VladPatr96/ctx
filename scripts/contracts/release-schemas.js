import { z } from 'zod';

export const ReleasePackageSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
}).strict();

export const ReleasePublishSchema = z.object({
  workflowName: z.string().min(1).nullable(),
  workflowPath: z.string().min(1).nullable(),
  branches: z.array(z.string().min(1)),
  requiresNpmToken: z.boolean(),
  runsTests: z.boolean(),
  registryUrl: z.string().url().nullable(),
  strategy: z.enum(['push_if_new_version', 'missing']),
}).strict();

export const ReleaseChangelogSchema = z.object({
  exists: z.boolean(),
  path: z.string().min(1),
  automated: z.boolean(),
}).strict();

export const ReleaseNotesSchema = z.object({
  automated: z.boolean(),
  usesConventionalCommits: z.boolean(),
}).strict();

export const ReleaseMetadataSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  package: ReleasePackageSchema,
  versionSourceOfTruth: z.literal('package.json'),
  publish: ReleasePublishSchema,
  changelog: ReleaseChangelogSchema,
  releaseNotes: ReleaseNotesSchema,
  gaps: z.array(z.string()),
}).strict();

export function parseReleaseMetadata(input) {
  return ReleaseMetadataSchema.parse(input);
}

export function createReleaseMetadata(input) {
  return parseReleaseMetadata(input);
}
