import { z } from 'zod';

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

