import { z } from 'zod';

// ─── docs-schemas ────────────────────────────────────────────────────────────

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

// ─── interface-reference-schemas ─────────────────────────────────────────────

export const InterfaceSourceSchema = z.enum(['built_in', 'skill']);

export const CliCommandSurfaceSchema = z.object({
  name: z.string().min(1),
  source: InterfaceSourceSchema,
  description: z.string().min(1),
  usage: z.string().min(1),
  skill: z.string().nullable(),
  category: z.string().nullable(),
}).strict();

export const McpToolSurfaceSchema = z.object({
  name: z.string().min(1),
  source: InterfaceSourceSchema,
  description: z.string().min(1),
  inputType: z.string().min(1),
  skill: z.string().nullable(),
  category: z.string().nullable(),
}).strict();

const InterfaceSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  builtIn: z.number().int().nonnegative(),
  skill: z.number().int().nonnegative(),
}).strict();

export const InterfaceReferenceSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  cli: z.object({
    commands: z.array(CliCommandSurfaceSchema),
    summary: InterfaceSummarySchema,
  }).strict(),
  mcp: z.object({
    tools: z.array(McpToolSurfaceSchema),
    summary: InterfaceSummarySchema,
  }).strict(),
}).strict();

export function parseInterfaceReference(input) {
  return InterfaceReferenceSchema.parse(input);
}

export function createInterfaceReference({ generatedAt, cliCommands, mcpTools }) {
  const normalizedCliCommands = cliCommands.map((command) => CliCommandSurfaceSchema.parse(command));
  const normalizedMcpTools = mcpTools.map((tool) => McpToolSurfaceSchema.parse(tool));

  return parseInterfaceReference({
    generatedAt,
    cli: {
      commands: normalizedCliCommands,
      summary: summarizeBySource(normalizedCliCommands),
    },
    mcp: {
      tools: normalizedMcpTools,
      summary: summarizeBySource(normalizedMcpTools),
    },
  });
}

function summarizeBySource(entries) {
  return {
    total: entries.length,
    builtIn: entries.filter((entry) => entry.source === 'built_in').length,
    skill: entries.filter((entry) => entry.source === 'skill').length,
  };
}

// ─── orchestration-boundary-brief-schemas ────────────────────────────────────

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

// ─── project-history-schemas ──────────────────────────────────────────────────

export const ProjectHistorySourceSchema = z.enum(['session', 'adr']);

export const SessionHistoryEntrySchema = z.object({
  sessionId: z.string().min(1),
  title: z.string().min(1),
  path: z.string().min(1),
  project: z.string().nullable(),
  branch: z.string().nullable(),
  lead: z.string().nullable(),
  goals: z.string().nullable(),
  summary: z.string().nullable(),
  actionsCount: z.number().int().nonnegative(),
  errorsCount: z.number().int().nonnegative(),
  decisionsCount: z.number().int().nonnegative(),
  filesModifiedCount: z.number().int().nonnegative(),
  tasksCount: z.number().int().nonnegative(),
}).strict();

export const DecisionHistoryEntrySchema = z.object({
  id: z.string().min(1),
  source: ProjectHistorySourceSchema,
  title: z.string().min(1),
  path: z.string().min(1),
  recordedOn: z.string().min(1),
  status: z.string().nullable(),
  summary: z.string().min(1),
  sessionId: z.string().nullable(),
}).strict();

export const SessionHistorySummarySchema = z.object({
  total: z.number().int().nonnegative(),
  withDecisions: z.number().int().nonnegative(),
  withErrors: z.number().int().nonnegative(),
  withSummary: z.number().int().nonnegative(),
}).strict();

export const DecisionHistorySummarySchema = z.object({
  total: z.number().int().nonnegative(),
  bySource: z.object({
    session: z.number().int().nonnegative(),
    adr: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export const ProjectHistoryArtifactSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  sessions: z.object({
    entries: z.array(SessionHistoryEntrySchema),
    summary: SessionHistorySummarySchema,
  }).strict(),
  decisions: z.object({
    entries: z.array(DecisionHistoryEntrySchema),
    summary: DecisionHistorySummarySchema,
  }).strict(),
}).strict();

export function parseProjectHistoryArtifact(input) {
  return ProjectHistoryArtifactSchema.parse(input);
}

export function createProjectHistoryArtifact({ generatedAt, sessions, decisions }) {
  const normalizedSessions = sessions.map((entry) => SessionHistoryEntrySchema.parse(entry));
  const normalizedDecisions = decisions.map((entry) => DecisionHistoryEntrySchema.parse(entry));

  return parseProjectHistoryArtifact({
    generatedAt,
    sessions: {
      entries: normalizedSessions,
      summary: {
        total: normalizedSessions.length,
        withDecisions: normalizedSessions.filter((entry) => entry.decisionsCount > 0).length,
        withErrors: normalizedSessions.filter((entry) => entry.errorsCount > 0).length,
        withSummary: normalizedSessions.filter((entry) => Boolean(entry.summary)).length,
      },
    },
    decisions: {
      entries: normalizedDecisions,
      summary: {
        total: normalizedDecisions.length,
        bySource: {
          session: normalizedDecisions.filter((entry) => entry.source === 'session').length,
          adr: normalizedDecisions.filter((entry) => entry.source === 'adr').length,
        },
      },
    },
  });
}

// ─── team-knowledge-brief-schemas ────────────────────────────────────────────

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

// ─── release-schemas ──────────────────────────────────────────────────────────

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
