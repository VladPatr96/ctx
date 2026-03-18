import { z } from 'zod';

const PROVIDER_KEY_PATTERN = /^[a-z][a-z0-9-]*$/;
const TASK_TYPE_PATTERN = /^[a-z][a-z0-9_:-]*$/;
const RUNTIME_RECORD_ID_PATTERN = /^[a-z][a-z0-9:_-]{0,127}$/;

export const UnitIntervalSchema = z.number().finite().min(0).max(1);
export const ProviderKeySchema = z.string().regex(PROVIDER_KEY_PATTERN, 'Invalid provider key');
export const TaskTypeSchema = z.string().regex(TASK_TYPE_PATTERN, 'Invalid task type');
export const RuntimeRecordIdSchema = z.string().regex(RUNTIME_RECORD_ID_PATTERN, 'Invalid runtime record id');
export const IsoDatetimeSchema = z.string().datetime({ offset: true });
export const ExecutionStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'timeout',
  'skipped',
  'partial',
]);
export const ExecutionModeSchema = z.enum(['api', 'cli', 'agent']);
export const RuntimeAvailabilityStatusSchema = z.enum(['ready', 'degraded', 'offline']);
export const StepStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'suspended',
  'skipped',
]);
export const StepFailureKindSchema = z.enum(['retryable', 'fatal']);
export const StepEventSchema = z.enum(['start', 'complete', 'fail', 'retry', 'suspend', 'resume', 'skip']);
export const StepTransitionSchema = z.object({
  event: StepEventSchema,
  from: StepStatusSchema,
  to: StepStatusSchema,
  at: IsoDatetimeSchema,
  note: z.string().optional(),
  error: z.string().optional(),
  failureKind: StepFailureKindSchema.optional(),
}).strict();
export const StepRecordSchema = z.object({
  stepId: RuntimeRecordIdSchema,
  stepType: TaskTypeSchema,
  status: StepStatusSchema,
  attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  createdAt: IsoDatetimeSchema,
  startedAt: IsoDatetimeSchema.optional(),
  completedAt: IsoDatetimeSchema.optional(),
  suspendedAt: IsoDatetimeSchema.optional(),
  failureKind: StepFailureKindSchema.nullable(),
  lastError: z.string().nullable(),
  metadata: z.record(z.unknown()),
  transitions: z.array(StepTransitionSchema),
}).strict();
export const TaskStatusSchema = z.enum([
  'pending',
  'running',
  'completed',
  'failed',
  'suspended',
  'skipped',
  'cancelled',
]);
export const TaskFailureKindSchema = z.enum(['retryable', 'fatal']);
export const TaskEventSchema = z.enum([
  'start',
  'complete',
  'fail',
  'retry',
  'suspend',
  'resume',
  'skip',
  'cancel',
]);
export const TaskTransitionSchema = z.object({
  event: TaskEventSchema,
  from: TaskStatusSchema,
  to: TaskStatusSchema,
  at: IsoDatetimeSchema,
  note: z.string().optional(),
  error: z.string().optional(),
  failureKind: TaskFailureKindSchema.optional(),
}).strict();
export const TaskRecordSchema = z.object({
  taskId: RuntimeRecordIdSchema,
  taskType: TaskTypeSchema,
  status: TaskStatusSchema,
  attempt: z.number().int().nonnegative(),
  maxAttempts: z.number().int().positive(),
  createdAt: IsoDatetimeSchema,
  startedAt: IsoDatetimeSchema.optional(),
  completedAt: IsoDatetimeSchema.optional(),
  suspendedAt: IsoDatetimeSchema.optional(),
  failureKind: TaskFailureKindSchema.nullable(),
  lastError: z.string().nullable(),
  metadata: z.record(z.unknown()),
  transitions: z.array(TaskTransitionSchema),
}).strict();

export const RoutingParticipantSchema = z.object({
  provider: ProviderKeySchema,
  mode: ExecutionModeSchema.optional(),
  confidence: UnitIntervalSchema.optional(),
}).strict();

export const RoutingScoringSchema = z.object({
  finalScore: UnitIntervalSchema.optional(),
  staticComponent: UnitIntervalSchema.optional(),
  evalComponent: UnitIntervalSchema.optional(),
  feedbackComponent: UnitIntervalSchema.optional(),
  exploreComponent: UnitIntervalSchema.optional(),
  alpha: UnitIntervalSchema.optional(),
}).strict();

export const RoutingDecisionSchema = z.object({
  provider: ProviderKeySchema,
  strength: TaskTypeSchema,
  reason: z.string().min(1),
  confidence: UnitIntervalSchema,
  mode: ExecutionModeSchema.optional(),
  backupProvider: ProviderKeySchema.optional(),
  backupMode: ExecutionModeSchema.optional(),
  consensusParticipants: z.array(RoutingParticipantSchema).optional(),
  scoring: RoutingScoringSchema.optional(),
}).strict();

export const RoutingDecisionLogRecordSchema = z.object({
  timestamp: IsoDatetimeSchema,
  task_snippet: z.string().max(120),
  task_type: TaskTypeSchema,
  selected_provider: ProviderKeySchema,
  runner_up: ProviderKeySchema.nullable().optional(),
  final_score: UnitIntervalSchema,
  static_component: UnitIntervalSchema,
  eval_component: UnitIntervalSchema,
  feedback_component: UnitIntervalSchema,
  explore_component: UnitIntervalSchema,
  alpha: UnitIntervalSchema,
  delta: z.number().finite().nullable().optional(),
  is_diverged: z.union([z.literal(0), z.literal(1)]),
  routing_mode: z.enum(['static', 'adaptive', 'override']),
}).strict();

export const ArtifactRecordSchema = z.object({
  kind: z.enum(['response', 'error', 'worktree', 'branch', 'log', 'report', 'file']),
  label: z.string().min(1),
  path: z.string().min(1).optional(),
  content: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
}).strict().superRefine((value, ctx) => {
  if (!value.path && value.content === undefined && !value.metadata) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'Artifact record requires path, content, or metadata',
    });
  }
});

export const ArtifactBundleSchema = z.object({
  version: z.literal(1),
  status: ExecutionStatusSchema,
  summary: z.string(),
  artifacts: z.array(ArtifactRecordSchema),
  metadata: z.record(z.unknown()),
  timings: z.object({
    startedAt: IsoDatetimeSchema.optional(),
    completedAt: IsoDatetimeSchema.optional(),
    durationMs: z.number().int().nonnegative().nullable().optional(),
  }).strict(),
}).strict();

export function parseRoutingDecision(input) {
  return RoutingDecisionSchema.parse(input);
}

export function parseArtifactBundle(input) {
  return ArtifactBundleSchema.parse(input);
}

export function parseStepRecord(input) {
  return StepRecordSchema.parse(input);
}

export function parseTaskRecord(input) {
  return TaskRecordSchema.parse(input);
}

export function createRoutingDecisionLogRecord(decision, { maxSnippetLength = 120 } = {}) {
  const snippetLength = Number.isInteger(maxSnippetLength) && maxSnippetLength > 0
    ? maxSnippetLength
    : 120;
  const snippet = String(decision.task ?? '').slice(0, snippetLength);
  const finalScore = decision.finalScore ?? 0;
  const runnerUp = decision.runnerUp || null;
  const runnerUpScore = decision.runnerUpScore ?? null;
  const delta = runnerUp && runnerUpScore != null ? finalScore - runnerUpScore : null;
  const isDiverged = decision.staticBest && decision.selectedProvider !== decision.staticBest ? 1 : 0;

  return RoutingDecisionLogRecordSchema.parse({
    timestamp: new Date().toISOString(),
    task_snippet: snippet,
    task_type: decision.taskType || 'unknown',
    selected_provider: decision.selectedProvider || 'unknown',
    runner_up: runnerUp,
    final_score: finalScore,
    static_component: decision.staticComponent ?? 0,
    eval_component: decision.evalComponent ?? 0,
    feedback_component: decision.feedbackComponent ?? 0,
    explore_component: decision.exploreComponent ?? 0,
    alpha: decision.alpha ?? 0,
    delta,
    is_diverged: isDiverged,
    routing_mode: decision.routingMode || 'static',
  });
}

export function createExecutionArtifactBundle(entry) {
  const artifacts = [];

  if (entry?.worktreePath) {
    artifacts.push({
      kind: 'worktree',
      label: 'worktree-path',
      path: entry.worktreePath,
    });
  }

  if (entry?.branchName) {
    artifacts.push({
      kind: 'branch',
      label: 'git-branch',
      content: String(entry.branchName),
    });
  }

  if (entry?.response) {
    artifacts.push({
      kind: 'response',
      label: 'provider-response',
      content: String(entry.response),
    });
  }

  if (entry?.error) {
    artifacts.push({
      kind: 'error',
      label: 'provider-error',
      content: String(entry.error),
    });
  }

  return ArtifactBundleSchema.parse({
    version: 1,
    status: entry?.status ?? 'completed',
    summary: buildExecutionSummary(entry),
    artifacts,
    metadata: {
      agentId: entry?.agentId ?? null,
      provider: entry?.provider ?? null,
      branchName: entry?.branchName ?? null,
      worktreePath: entry?.worktreePath ?? null,
    },
    timings: {
      startedAt: entry?.startedAt,
      completedAt: entry?.completedAt,
      durationMs: entry?.durationMs ?? null,
    },
  });
}

export function withExecutionArtifactBundle(entry) {
  if (!entry) return null;
  return {
    ...entry,
    artifactBundle: createExecutionArtifactBundle(entry),
  };
}

export function createPipelineArtifactBundle(report, { reportPath } = {}) {
  const artifacts = [
    {
      kind: 'report',
      label: 'pipeline-summary',
      metadata: {
        pipelineId: report?.pipelineId ?? null,
        status: report?.status ?? null,
        taskStatus: report?.task?.status ?? null,
        executed: report?.summary?.executed ?? 0,
        merged: report?.summary?.merged ?? 0,
        testsPassed: report?.summary?.testsPassed ?? false,
      },
    },
  ];

  if (reportPath) {
    artifacts.push({
      kind: 'file',
      label: 'pipeline-report',
      path: reportPath,
    });
  }

  if (report?.integrationBranch) {
    artifacts.push({
      kind: 'branch',
      label: 'integration-branch',
      content: String(report.integrationBranch),
    });
  }

  if (report?.phases?.verify?.output) {
    artifacts.push({
      kind: 'log',
      label: 'verification-output',
      content: String(report.phases.verify.output),
    });
  }

  return ArtifactBundleSchema.parse({
    version: 1,
    status: normalizePipelineArtifactStatus(report?.status),
    summary: buildPipelineSummary(report),
    artifacts,
    metadata: {
      pipelineId: report?.pipelineId ?? null,
      integrationBranch: report?.integrationBranch ?? null,
      reportPath: reportPath ?? null,
      taskStatus: report?.task?.status ?? null,
    },
    timings: {
      startedAt: report?.startedAt,
      completedAt: report?.completedAt,
      durationMs: report?.durationMs ?? null,
    },
  });
}

export function withPipelineArtifactBundle(report, { reportPath } = {}) {
  if (!report) return null;
  return {
    ...report,
    artifactBundle: createPipelineArtifactBundle(report, { reportPath }),
  };
}

function buildExecutionSummary(entry) {
  const agentId = entry?.agentId ? `Agent ${entry.agentId}` : 'Execution';
  const provider = entry?.provider ? `via ${entry.provider}` : 'via unknown provider';
  const status = entry?.status || 'completed';
  return `${agentId} ${provider} ${status}`.trim();
}

function buildPipelineSummary(report) {
  const pipelineId = report?.pipelineId ? `Pipeline ${report.pipelineId}` : 'Pipeline';
  const status = report?.status || 'running';
  return `${pipelineId} ${status}`.trim();
}

function normalizePipelineArtifactStatus(status) {
  switch (status) {
    case 'success':
      return 'completed';
    case 'failed':
    case 'error':
      return 'failed';
    case 'running':
      return 'running';
    default:
      return 'partial';
  }
}
