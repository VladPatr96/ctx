import { z } from 'zod';

export const TeamKnowledgeBoundarySectionIdSchema = z.enum([
  'single_user_runtime',
  'shared_team_knowledge',
  'enterprise_deferred',
]);

export const TeamKnowledgeBoundarySectionSchema = z.object({
  id: TeamKnowledgeBoundarySectionIdSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  ownership: z.array(z.string().min(1)).min(1),
  writePath: z.string().min(1),
  syncBoundary: z.string().min(1),
  includedCapabilities: z.array(z.string().min(1)).min(1),
  excludedCapabilities: z.array(z.string().min(1)).min(1),
}).strict();

export const TeamKnowledgeAccessRoleIdSchema = z.enum([
  'workspace_owner',
  'contributor',
  'viewer',
]);

export const TeamKnowledgePermissionSchema = z.enum([
  'manage_members',
  'manage_policies',
  'read_shared_knowledge',
  'write_shared_knowledge',
  'publish_templates',
  'approve_exports',
]);

export const TeamKnowledgeAccessRoleSchema = z.object({
  id: TeamKnowledgeAccessRoleIdSchema,
  title: z.string().min(1),
  summary: z.string().min(1),
  permissions: z.array(TeamKnowledgePermissionSchema).min(1),
  constraints: z.array(z.string().min(1)).min(1),
}).strict();

export const TeamKnowledgeBoundaryBriefSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  title: z.string().min(1),
  thesis: z.string().min(1),
  boundaries: z.array(TeamKnowledgeBoundarySectionSchema).min(3),
  accessModel: z.object({
    roles: z.array(TeamKnowledgeAccessRoleSchema).min(3),
    governanceAssumptions: z.array(z.string().min(1)).min(3),
    rolloutGuards: z.array(z.string().min(1)).min(3),
  }).strict(),
  nonGoals: z.array(z.string().min(1)).min(4),
}).strict();

export function parseTeamKnowledgeBoundaryBrief(input) {
  return TeamKnowledgeBoundaryBriefSchema.parse(input);
}

export function createTeamKnowledgeBoundaryBrief({
  generatedAt,
  title,
  thesis,
  boundaries,
  accessModel,
  nonGoals,
}) {
  return parseTeamKnowledgeBoundaryBrief({
    generatedAt,
    title,
    thesis,
    boundaries,
    accessModel,
    nonGoals,
  });
}
