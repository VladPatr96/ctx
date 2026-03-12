import { z } from 'zod';

export const StageSchema = z.enum([
  'idle',
  'detect',
  'context',
  'task',
  'brainstorm',
  'plan',
  'execute',
  'done'
]);

export const PipelineSchema = z.object({
  stage: StageSchema.default('detect'),
  lead: z.string().default('codex'),
  task: z.string().nullable().default(null),
  updatedAt: z.string().optional()
}).passthrough();

export const LogEntrySchema = z.object({
  ts: z.string().optional(),
  time: z.string().optional(),
  action: z.string().optional(),
  message: z.string().optional(),
  stage: z.string().optional()
}).passthrough();

export const AgentSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  role: z.string().optional(),
  stage: z.string().optional(),
  skills: z.array(z.string()).optional()
}).passthrough();

export const ConsiliumPresetSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  providers: z.array(z.string()).optional(),
  agents: z.array(z.string()).optional()
}).passthrough();

export const ConsiliumResultSchema = z.object({
  provider: z.string().optional(),
  task: z.string().optional(),
  result: z.string().optional(),
  confidence: z.number().nullable().optional(),
  time: z.string().optional(),
  runId: z.number().optional()
}).passthrough();

export const KBEntrySchema = z.object({
  id: z.number().optional(),
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
  retrieval: z.object({
    strategy: z.literal('hybrid'),
    score: z.number(),
    textScore: z.number(),
    projectBoost: z.number(),
    recencyBoost: z.number(),
    accessBoost: z.number(),
    matchReason: z.string(),
  }).optional(),
}).passthrough();

export const KBStatsSchema = z.object({
  total: z.number().default(0),
  byCategory: z.record(z.number()).default({}),
  byProject: z.record(z.number()).default({})
});

export const KnowledgeContinuitySuggestionSchema = z.object({
  type: z.enum(['resume', 'decision', 'error', 'search']),
  title: z.string(),
  description: z.string(),
  entryId: z.number().nullable(),
});

export const KnowledgeContinuityDigestSchema = z.object({
  generatedAt: z.string(),
  project: z.string(),
  snapshot: z.object({
    exists: z.boolean(),
    createdAt: z.string().nullable(),
    branch: z.string().nullable(),
    task: z.string().nullable(),
    stage: z.string().nullable(),
  }),
  stats: z.object({
    totalEntries: z.number(),
    sessions: z.number(),
    decisions: z.number(),
    errors: z.number(),
  }),
  recentSessions: z.array(KBEntrySchema),
  recentDecisions: z.array(KBEntrySchema),
  recentErrors: z.array(KBEntrySchema),
  suggestions: z.array(KnowledgeContinuitySuggestionSchema),
});

export const KnowledgeQualityGapSchema = z.object({
  type: z.enum(['snapshot_missing', 'session_missing', 'stale_archive']),
  project: z.string(),
  description: z.string(),
});

export const KnowledgeProjectHealthSchema = z.object({
  project: z.string(),
  totalEntries: z.number(),
  lastUpdatedAt: z.string().nullable(),
  snapshotExists: z.boolean(),
  snapshotUpdatedAt: z.string().nullable(),
  staleEntries: z.number(),
  sessionEntries: z.number(),
  decisionEntries: z.number(),
  errorEntries: z.number(),
  categories: z.array(z.string()),
});

export const KnowledgeQualitySummarySchema = z.object({
  generatedAt: z.string(),
  staleAfterDays: z.number(),
  totals: z.object({
    totalEntries: z.number(),
    totalProjects: z.number(),
    snapshotProjects: z.number(),
    staleEntries: z.number(),
  }),
  categoryCoverage: z.array(z.object({
    category: z.string(),
    count: z.number(),
  })),
  projects: z.array(KnowledgeProjectHealthSchema),
  gaps: z.array(KnowledgeQualityGapSchema),
});

export const KnowledgeExportSectionSchema = z.object({
  category: z.string(),
  count: z.number(),
  entries: z.array(KBEntrySchema),
});

export const KnowledgeProjectExportSchema = z.object({
  generatedAt: z.string(),
  project: z.string(),
  staleAfterDays: z.number(),
  snapshot: KnowledgeContinuityDigestSchema.shape.snapshot,
  continuity: KnowledgeContinuityDigestSchema,
  quality: z.object({
    totalEntries: z.number(),
    staleEntries: z.number(),
    lastUpdatedAt: z.string().nullable(),
    categories: z.array(z.string()),
  }),
  sections: z.array(KnowledgeExportSectionSchema),
});

export const KnowledgeSuggestionRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  action: z.enum(['resume_context', 'review_decision', 'triage_error', 'capture_session']),
  sourceEntryIds: z.array(z.number()),
});

export const KnowledgeTemplateRecordSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  prompt: z.string(),
  sourceCategories: z.array(z.string()),
  sourceEntryIds: z.array(z.number()),
});

export const KnowledgeSuggestionSummarySchema = z.object({
  generatedAt: z.string(),
  project: z.string(),
  exportArtifact: KnowledgeProjectExportSchema,
  suggestions: z.array(KnowledgeSuggestionRecordSchema),
  templates: z.array(KnowledgeTemplateRecordSchema),
});

export const RoutingDecisionSchema = z.object({
  id: z.number().optional(),
  timestamp: z.string(),
  task_snippet: z.string(),
  task_type: z.string(),
  selected_provider: z.string(),
  runner_up: z.string().nullable().optional(),
  final_score: z.number(),
  static_component: z.number(),
  eval_component: z.number(),
  feedback_component: z.number().default(0),
  explore_component: z.number(),
  alpha: z.number(),
  delta: z.number().nullable().optional(),
  is_diverged: z.number().default(0),
  routing_mode: z.string()
});

export const RoutingAnomalySchema = z.object({
  type: z.string(),
  severity: z.string(),
  message: z.string()
});

export interface RoutingHealthData {
  ok: boolean;
  total_decisions: number;
  recent_decisions: z.infer<typeof RoutingDecisionSchema>[];
  distribution: Array<{ selected_provider: string; cnt: number }>;
  anomalies: z.infer<typeof RoutingAnomalySchema>[];
  stats: {
    avg_score?: number;
    min_score?: number;
    max_score?: number;
    avg_alpha?: number;
    min_alpha?: number;
    max_alpha?: number;
    avg_explore?: number;
    diverged_count?: number;
  };
}

export const ProviderHealthEntrySchema = z.object({
  failures: z.number().default(0),
  calls: z.number().default(0),
  successes: z.number().default(0),
  totalFailures: z.number().default(0),
  successRate: z.number().default(0),
  lastLatencyMs: z.number().default(0),
  avgLatencyMs: z.number().default(0),
  totalLatencyMs: z.number().optional(),
  lastSuccess: z.string().optional(),
  lastFailure: z.string().optional(),
  updatedAt: z.string().optional()
}).passthrough();

export const ShellStorageSourceSchema = z.object({
  source: z.string(),
  channel: z.string().optional(),
  backing: z.string().optional(),
  mode: z.string().optional(),
  failover: z.boolean().optional(),
  shadow: z.boolean().optional(),
  path: z.string().optional(),
  migration: z.string().optional(),
}).passthrough();

export const RuntimeAvailabilityStatusSchema = z.enum(['ready', 'degraded', 'offline']);

export const ShellStorageSummarySchema = z.object({
  status: RuntimeAvailabilityStatusSchema.default('offline'),
  mode: z.string().default('unknown'),
  effectiveMode: z.string().default('unknown'),
  policyState: z.string().nullable().default(null),
  failureRatio: z.number().nullable().default(null),
  failover: z.boolean().default(false),
  shadow: z.boolean().default(false),
  warningActive: z.boolean().default(false),
  reasons: z.array(z.string()).default([]),
  sourceCount: z.number().default(0),
  sources: z.record(ShellStorageSourceSchema).default({}),
  ts: z.string().nullable().default(null),
}).passthrough();

export const ShellProviderCardSchema = z.object({
  provider: z.string(),
  status: RuntimeAvailabilityStatusSchema.default('offline'),
  model: z.string().nullable().default(null),
  calls: z.number().default(0),
  successes: z.number().default(0),
  failures: z.number().default(0),
  consecutiveFailures: z.number().default(0),
  circuitOpen: z.boolean().default(false),
  successRate: z.number().default(0),
  avgLatencyMs: z.number().default(0),
  lastLatencyMs: z.number().default(0),
  lastSuccess: z.string().nullable().default(null),
  lastFailure: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
  hasTelemetry: z.boolean().default(false),
  reasons: z.array(z.string()).default([]),
}).passthrough();

export const ShellSummarySchema = z.object({
  session: z.object({
    stage: z.string().default('idle'),
    lead: z.string().default('codex'),
    task: z.string().nullable().default(null),
    updatedAt: z.string().nullable().default(null),
  }),
  project: z.object({
    name: z.string().default(''),
    branch: z.string().default(''),
    stackLabel: z.string().default(''),
  }),
  storage: ShellStorageSummarySchema,
  providers: z.object({
    models: z.record(z.string()).default({}),
    cards: z.array(ShellProviderCardSchema).default([]),
  }),
});

export const ClaimNodeSchema = z.object({
  id: z.string(),
  text: z.string(),
  type: z.enum(['fact', 'opinion', 'risk', 'requirement']),
});

export const ClaimPositionSchema = z.object({
  alias: z.string(),
  stance: z.enum(['accept', 'challenge']),
  argument: z.string().optional(),
});

export const ClaimGraphSchema = z.object({
  consensus: z.array(ClaimNodeSchema.extend({
    supportedBy: z.array(z.string()),
  })),
  contested: z.array(ClaimNodeSchema.extend({
    positions: z.array(ClaimPositionSchema),
  })),
  unique: z.array(ClaimNodeSchema.extend({
    from: z.string(),
  })),
  stats: z.object({
    total: z.number(),
    consensus_count: z.number(),
    contested_count: z.number(),
    unique_count: z.number(),
    contention_ratio: z.number(),
  }),
  userVerdicts: z.record(z.enum(['true', 'false'])).optional(),
});

export const ConsiliumObservabilityParticipantSchema = z.object({
  provider: z.string(),
  alias: z.string(),
}).strict();

export const ConsiliumObservabilityResponseSchema = z.object({
  provider: z.string(),
  alias: z.string(),
  status: z.string(),
  responseMs: z.number().nullable(),
  error: z.string().nullable(),
}).strict();

export const ConsiliumObservabilityRoundSchema = z.object({
  round: z.number(),
  successfulResponses: z.number(),
  failedResponses: z.number(),
  claimsExtracted: z.number(),
  newClaims: z.number(),
  responses: z.array(ConsiliumObservabilityResponseSchema),
}).strict();

export const ConsiliumTrustScoreSchema = z.object({
  targetAlias: z.string(),
  targetProvider: z.string().nullable(),
  score: z.number().min(0).max(1),
}).strict();

export const ConsiliumTrustMatrixRowSchema = z.object({
  fromAlias: z.string(),
  fromProvider: z.string().nullable(),
  scores: z.array(ConsiliumTrustScoreSchema),
}).strict();

export const ConsiliumClaimGraphStatsSchema = z.object({
  total: z.number(),
  consensusCount: z.number(),
  contestedCount: z.number(),
  uniqueCount: z.number(),
  contentionRatio: z.number().min(0).max(1),
}).strict();

export const ConsiliumSynthesisSummarySchema = z.object({
  provider: z.string().nullable(),
  status: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
  recommendation: z.string().nullable(),
  consensusPoints: z.number(),
  disputedPoints: z.number(),
}).strict();

export const ConsiliumAutoStopSchema = z.object({
  stoppedAfterRound: z.number(),
  reason: z.string(),
}).strict();

export const ConsiliumObservabilitySchema = z.object({
  generatedAt: z.string(),
  runId: z.string().nullable(),
  topic: z.string(),
  totalDurationMs: z.number(),
  structured: z.boolean(),
  participants: z.array(ConsiliumObservabilityParticipantSchema),
  rounds: z.array(ConsiliumObservabilityRoundSchema),
  trustMatrix: z.array(ConsiliumTrustMatrixRowSchema),
  claimGraph: ConsiliumClaimGraphStatsSchema.nullable(),
  synthesis: ConsiliumSynthesisSummarySchema,
  autoStop: ConsiliumAutoStopSchema.nullable(),
}).strict();

export const ConsiliumReplayArchiveReferenceSchema = z.object({
  id: z.string(),
  type: z.enum(['dashboard_replay', 'github_issue']),
  label: z.string(),
  href: z.string(),
}).strict();

export const ConsiliumReplayKnowledgeActionSchema = z.object({
  id: z.string(),
  type: z.enum(['knowledge_search', 'knowledge_project']),
  label: z.string(),
  href: z.string(),
  project: z.string(),
  query: z.string().nullable(),
}).strict();

export const ConsiliumReplayKnowledgeEntrySchema = z.object({
  entryId: z.number(),
  project: z.string(),
  category: z.string(),
  title: z.string(),
  snippet: z.string(),
  href: z.string(),
  updatedAt: z.string().nullable(),
  source: z.string().nullable(),
  githubUrl: z.string().nullable(),
  retrieval: z.object({
    score: z.number().nullable(),
    matchReason: z.string().nullable(),
  }).strict(),
}).strict();

export const ConsiliumReplayKnowledgeContinuitySchema = z.object({
  snapshotExists: z.boolean(),
  snapshotTask: z.string().nullable(),
  snapshotBranch: z.string().nullable(),
  recentDecisionTitle: z.string().nullable(),
  suggestionTitles: z.array(z.string()),
}).strict();

export const ConsiliumReplayKnowledgeContextSchema = z.object({
  project: z.string(),
  query: z.string(),
  actions: z.array(ConsiliumReplayKnowledgeActionSchema),
  entries: z.array(ConsiliumReplayKnowledgeEntrySchema),
  continuity: ConsiliumReplayKnowledgeContinuitySchema.nullable(),
}).strict();

export const ConsiliumReplayDecisionSchema = z.object({
  runId: z.string(),
  project: z.string(),
  topic: z.string(),
  mode: z.string(),
  startedAt: z.string(),
  endedAt: z.string().nullable(),
  durationMs: z.number().nullable(),
  roundsCount: z.number(),
  providersInvoked: z.array(z.string()),
  providersResponded: z.array(z.string()),
  proposedBy: z.string().nullable(),
  consensus: z.boolean(),
  decisionSummary: z.string().nullable(),
  archiveReferences: z.array(ConsiliumReplayArchiveReferenceSchema),
}).strict();

export const ConsiliumReplayProviderSchema = z.object({
  provider: z.string(),
  model: z.string().nullable(),
  status: z.string(),
  responseMs: z.number().nullable(),
  confidence: z.number().nullable(),
  keyIdea: z.string().nullable(),
  wasChosen: z.boolean(),
  error: z.string().nullable(),
}).strict();

export const ConsiliumReplayRoundResponseSchema = z.object({
  provider: z.string(),
  alias: z.string(),
  status: z.string(),
  responseMs: z.number().nullable(),
  confidence: z.number().nullable(),
  positionChanged: z.boolean(),
  responseText: z.string().nullable(),
}).strict();

export const ConsiliumReplayRoundSchema = z.object({
  round: z.number(),
  completedResponses: z.number(),
  failedResponses: z.number(),
  avgResponseMs: z.number().nullable(),
  avgConfidence: z.number().nullable(),
  positionsChanged: z.number(),
  responses: z.array(ConsiliumReplayRoundResponseSchema),
}).strict();

export const ConsiliumReplayEntrySchema = z.object({
  decision: ConsiliumReplayDecisionSchema,
  providers: z.array(ConsiliumReplayProviderSchema),
  rounds: z.array(ConsiliumReplayRoundSchema),
  knowledgeContext: ConsiliumReplayKnowledgeContextSchema.nullable(),
}).strict();

export const ConsiliumReplayFilterOptionSchema = z.object({
  value: z.string(),
  count: z.number(),
}).strict();

export const ConsiliumReplayFiltersSchema = z.object({
  applied: z.object({
    project: z.string().nullable(),
    provider: z.string().nullable(),
    consensus: z.enum(['all', 'consensus', 'open']),
  }).strict(),
  availableProjects: z.array(ConsiliumReplayFilterOptionSchema),
  availableProviders: z.array(ConsiliumReplayFilterOptionSchema),
  consensusCounts: z.object({
    all: z.number(),
    consensus: z.number(),
    open: z.number(),
  }).strict(),
}).strict();

export const ConsiliumReplayArchiveSchema = z.object({
  generatedAt: z.string(),
  selectedRunId: z.string().nullable(),
  filters: ConsiliumReplayFiltersSchema,
  decisions: z.array(ConsiliumReplayDecisionSchema),
  replay: ConsiliumReplayEntrySchema.nullable(),
}).strict();

export const ConsiliumReplayExportSchema = z.object({
  generatedAt: z.string(),
  runId: z.string(),
  format: z.enum(['markdown', 'json']),
  filename: z.string(),
  content: z.string(),
}).strict();

export const StateSchema = z.object({
  pipeline: PipelineSchema.default({ stage: 'idle', lead: 'codex', task: null }),
  log: z.array(LogEntrySchema).default([]),
  agents: z.array(AgentSchema).default([]),
  consilium: z.array(ConsiliumPresetSchema).default([]),
  results: z.array(ConsiliumResultSchema).default([]),
  storageHealth: z.any().nullable().optional(),
  providerHealth: z.record(ProviderHealthEntrySchema).default({}),
  project: z.any().optional(),
  claimGraph: ClaimGraphSchema.nullable().optional(),
  consiliumObservability: ConsiliumObservabilitySchema.nullable().optional(),
}).passthrough();

export type PipelineState = z.infer<typeof PipelineSchema>;
export type AppState = z.infer<typeof StateSchema>;
export type KBEntry = z.infer<typeof KBEntrySchema>;
export type KBStats = z.infer<typeof KBStatsSchema>;
export type Agent = z.infer<typeof AgentSchema>;
export type ConsiliumPreset = z.infer<typeof ConsiliumPresetSchema>;
export type ConsiliumResult = z.infer<typeof ConsiliumResultSchema>;
export type ProviderHealthEntry = z.infer<typeof ProviderHealthEntrySchema>;
export type RuntimeAvailabilityStatus = z.infer<typeof RuntimeAvailabilityStatusSchema>;
export type ShellStorageSummary = z.infer<typeof ShellStorageSummarySchema>;
export type ShellProviderCard = z.infer<typeof ShellProviderCardSchema>;
export type ShellSummary = z.infer<typeof ShellSummarySchema>;
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;
export type RoutingAnomaly = z.infer<typeof RoutingAnomalySchema>;
export type ClaimGraphData = z.infer<typeof ClaimGraphSchema>;
export type ClaimPosition = z.infer<typeof ClaimPositionSchema>;
export type ConsiliumObservability = z.infer<typeof ConsiliumObservabilitySchema>;
export type ConsiliumReplayArchiveReference = z.infer<typeof ConsiliumReplayArchiveReferenceSchema>;
export type ConsiliumReplayKnowledgeAction = z.infer<typeof ConsiliumReplayKnowledgeActionSchema>;
export type ConsiliumReplayKnowledgeEntry = z.infer<typeof ConsiliumReplayKnowledgeEntrySchema>;
export type ConsiliumReplayKnowledgeContinuity = z.infer<typeof ConsiliumReplayKnowledgeContinuitySchema>;
export type ConsiliumReplayKnowledgeContext = z.infer<typeof ConsiliumReplayKnowledgeContextSchema>;
export type ConsiliumReplayDecision = z.infer<typeof ConsiliumReplayDecisionSchema>;
export type ConsiliumReplayProvider = z.infer<typeof ConsiliumReplayProviderSchema>;
export type ConsiliumReplayRoundResponse = z.infer<typeof ConsiliumReplayRoundResponseSchema>;
export type ConsiliumReplayRound = z.infer<typeof ConsiliumReplayRoundSchema>;
export type ConsiliumReplayEntry = z.infer<typeof ConsiliumReplayEntrySchema>;
export type ConsiliumReplayFilterOption = z.infer<typeof ConsiliumReplayFilterOptionSchema>;
export type ConsiliumReplayFilters = z.infer<typeof ConsiliumReplayFiltersSchema>;
export type ConsiliumReplayArchive = z.infer<typeof ConsiliumReplayArchiveSchema>;
export type ConsiliumReplayExport = z.infer<typeof ConsiliumReplayExportSchema>;
export type KnowledgeContinuitySuggestion = z.infer<typeof KnowledgeContinuitySuggestionSchema>;
export type KnowledgeContinuityDigest = z.infer<typeof KnowledgeContinuityDigestSchema>;
export type KnowledgeQualityGap = z.infer<typeof KnowledgeQualityGapSchema>;
export type KnowledgeProjectHealth = z.infer<typeof KnowledgeProjectHealthSchema>;
export type KnowledgeQualitySummary = z.infer<typeof KnowledgeQualitySummarySchema>;
export type KnowledgeExportSection = z.infer<typeof KnowledgeExportSectionSchema>;
export type KnowledgeProjectExport = z.infer<typeof KnowledgeProjectExportSchema>;
export type KnowledgeSuggestionRecord = z.infer<typeof KnowledgeSuggestionRecordSchema>;
export type KnowledgeTemplateRecord = z.infer<typeof KnowledgeTemplateRecordSchema>;
export type KnowledgeSuggestionSummary = z.infer<typeof KnowledgeSuggestionSummarySchema>;

export interface RoutingDecisionFeedbackSummary {
  verdict: 'positive' | 'neutral' | 'negative' | 'unrated';
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  note: string | null;
  lastSubmittedAt: string | null;
}

export interface RoutingExplainabilityDecision {
  id: number | null;
  timestamp: string;
  taskType: string;
  selectedProvider: string;
  runnerUp: string | null;
  routingMode: 'static' | 'adaptive' | 'override';
  finalScore: number;
  scoreMargin: number | null;
  diverged: boolean;
  contributions: {
    static: number;
    evaluation: number;
    feedback: number;
    exploration: number;
  };
  explanation: {
    headline: string;
    summary: string;
    factors: string[];
  };
  feedback: RoutingDecisionFeedbackSummary;
}

export interface RoutingProviderFeedback {
  provider: string;
  total: number;
  positive: number;
  neutral: number;
  negative: number;
  score: number;
}

export interface RoutingExplainabilitySummary {
  generatedAt: string;
  mode: 'static' | 'adaptive' | 'config_off' | 'forced_off';
  readiness: {
    totalRuns: number;
    isReady: boolean;
    alpha: number;
    adaptiveEnabled: boolean;
  };
  totals: {
    totalDecisions: number;
    decisionCount: number;
    feedbackCount: number;
    negativeFeedbackCount: number;
  };
  anomalies: RoutingAnomaly[];
  distribution: Array<{ selected_provider: string; cnt: number }>;
  decisions: RoutingExplainabilityDecision[];
  feedback: {
    total: number;
    positive: number;
    neutral: number;
    negative: number;
    byProvider: RoutingProviderFeedback[];
  };
}

export interface RoutingFeedbackPayload {
  decisionId: number;
  provider?: string;
  taskType?: string;
  verdict: 'positive' | 'neutral' | 'negative';
  note?: string;
  actor?: string;
}

export interface RoutingFeedbackRecord {
  id: number;
  decisionId: number;
  provider: string;
  taskType: string;
  verdict: 'positive' | 'neutral' | 'negative';
  note: string | null;
  actor: string;
  createdAt: string;
}

export interface CostSummary {
  totalCost: number;
  totalRequests: number;
  costPerRequest: number;
  providers: Record<string, {
    cost: number;
    requests: number;
    models?: Record<string, { cost: number; requests: number }>;
  }>;
}

export interface ProviderCostData {
  provider: string;
  cost: number;
  requests: number;
  models?: Record<string, { cost: number; requests: number }>;
}

export interface Recommendation {
  type: string;
  priority: string;
  title: string;
  description: string;
  potentialSavings?: number;
  currentProvider?: string;
  suggestedProvider?: string;
}

export interface BudgetStatus {
  config: {
    global?: number;
    providers?: Record<string, number>;
    sessions?: Record<string, number>;
    projects?: Record<string, number>;
    thresholds?: {
      warning: number;
      critical: number;
    };
  };
  status: {
    global?: {
      status: string;
      current: number;
      budget: number;
      percentage: number;
    };
    providers?: Record<string, {
      status: string;
      current: number;
      budget: number;
      percentage: number;
    }>;
  };
}

export interface AnalyticsQuality {
  score: number;
  successRate: number;
  avgLatencyMs: number;
  calls: number;
}

export interface AnalyticsBudgetEntry {
  scope: 'global' | 'provider' | 'session' | 'project';
  key: string | null;
  status: string;
  budget: number;
  currentCost: number;
  remaining: number;
  percentUsed: number;
  alert: string | null;
}

export interface AnalyticsModelCard {
  model: string;
  totalCost: number;
  requests: number;
  totalTokens: number;
  avgCostPerRequest: number;
  avgCostPer1kTokens: number;
}

export interface AnalyticsProviderCard {
  provider: string;
  totalCost: number;
  requests: number;
  totalTokens: number;
  avgCostPerRequest: number;
  avgCostPer1kTokens: number;
  efficiencyScore: number | null;
  quality: AnalyticsQuality | null;
  budget: AnalyticsBudgetEntry | null;
  models: AnalyticsModelCard[];
}

export interface AnalyticsTrendPoint {
  bucketStart: string;
  label: string;
  totalCost: number;
  requests: number;
  providers: Record<string, number>;
}

export interface AnalyticsRecommendation {
  type: string;
  priority: string;
  title: string;
  description: string;
  confidence: string | null;
  currentProvider: string | null;
  suggestedProvider: string | null;
  currentModel: string | null;
  suggestedModel: string | null;
  impact: {
    savingsPerRequest: number;
    savingsPercent: number;
    estimatedMonthlySavings: number;
  };
}

export interface AnalyticsSummary {
  generatedAt: string;
  totals: {
    totalCost: number;
    totalRequests: number;
    totalTokens: number;
    providerCount: number;
    costPerRequest: number;
    projectedMonthlyCost: number;
    projectionConfidence: 'high' | 'medium' | 'low' | 'none';
  };
  providers: AnalyticsProviderCard[];
  timeline: {
    granularity: 'day';
    days: number;
    points: AnalyticsTrendPoint[];
  };
  recommendations: AnalyticsRecommendation[];
  budget: {
    hasAlerts: boolean;
    thresholds: {
      warning: number;
      critical: number;
    };
    global: AnalyticsBudgetEntry | null;
    providers: AnalyticsBudgetEntry[];
  };
  routing: {
    available: boolean;
    totalDecisions: number;
    anomalyCount: number;
    divergedCount: number;
    dominantProvider: string | null;
    lastDecisionAt: string | null;
  };
  gaps: string[];
}

export interface ProviderLifecycleContract {
  longRunning: boolean;
  hooks: string[];
  timeoutAction: 'kill' | 'graceful_stop' | 'suspend';
  cleanupScope: 'none' | 'process' | 'session' | 'workspace';
  supportsCheckpointing: boolean;
  supportsSuspend: boolean;
}

export interface ProviderDiscoveryInput {
  kind: 'static_catalog' | 'config_file' | 'command';
  value: string;
  optional: boolean;
}

export interface ProviderExtensibilityRecord {
  provider: string;
  mode: 'api' | 'cli' | 'agent';
  adapter: 'ApiAdapter' | 'CliAdapter' | 'AgentAdapter';
  transport: string | null;
  executionTransport: 'sdk' | 'subprocess' | 'delegated';
  lifecycle: ProviderLifecycleContract;
  capabilities: string[];
  notes: string;
  pluginSurface: 'builtin_provider' | 'configurable_provider' | 'local_model_provider';
  extensibility: 'builtin_only' | 'configurable' | 'local_model_capable';
  modelSource: 'static_catalog' | 'config_file' | 'cli_discovery' | 'hybrid';
  supportsCustomModels: boolean;
  supportsLocalModels: boolean;
  defaultModel: string | null;
  modelCount: number;
  exampleModels: string[];
  discoveryInputs: ProviderDiscoveryInput[];
  localModelHints: string[];
}

export interface ProviderExtensibilityInventory {
  generatedAt: string;
  summary: {
    totalProviders: number;
    builtinOnly: number;
    configurable: number;
    localModelCapable: number;
  };
  providers: ProviderExtensibilityRecord[];
}

export interface ProviderRecoveryHooks {
  lifecycleHooks: Array<
    'onTaskStart'
    | 'onTaskEnd'
    | 'onStepStart'
    | 'onStepEnd'
    | 'onStepTimeout'
    | 'onAbort'
  >;
  timeoutAction: 'kill' | 'graceful_stop' | 'suspend';
  cleanupScope: 'none' | 'process' | 'session' | 'workspace';
  supportsCheckpointing: boolean;
  supportsSuspend: boolean;
}

export interface ProviderRecoveryPlan {
  provider: string;
  status: 'ready' | 'degraded' | 'offline';
  outageLevel: 'none' | 'degraded' | 'offline';
  adapter: 'ApiAdapter' | 'CliAdapter' | 'AgentAdapter';
  executionTransport: 'sdk' | 'subprocess' | 'delegated';
  currentModel: string | null;
  defaultModel: string | null;
  fallbackProvider: string | null;
  fallbackRole: 'active_lead' | 'fallback' | 'local_model_fallback' | 'recovery_only' | null;
  recommendedAction:
    | 'continue_with_provider'
    | 'retry_request'
    | 'restart_subprocess_session'
    | 'wait_for_circuit_reset'
    | 'switch_to_fallback_provider'
    | 'switch_to_local_model_provider'
    | 'resume_checkpointed_session'
    | 'manual_reconfigure_provider';
  availableActions: Array<
    | 'continue_with_provider'
    | 'retry_request'
    | 'restart_subprocess_session'
    | 'wait_for_circuit_reset'
    | 'switch_to_fallback_provider'
    | 'switch_to_local_model_provider'
    | 'resume_checkpointed_session'
    | 'manual_reconfigure_provider'
  >;
  reasons: string[];
  hooks: ProviderRecoveryHooks;
}

export interface ProviderRecoveryInventory {
  generatedAt: string;
  summary: {
    totalProviders: number;
    actionableProviders: number;
    degradedProviders: number;
    offlineProviders: number;
    localModelRecoveryOptions: number;
  };
  providers: ProviderRecoveryPlan[];
}

export interface ResilienceAuditEvent {
  id: string;
  scope: 'storage' | 'provider';
  target: 'storage' | string;
  status: 'ready' | 'degraded' | 'offline';
  transition: 'degraded_entered' | 'offline_entered' | 'recovered';
  severity: 'info' | 'warning' | 'critical';
  recordedAt: string;
  reasons: string[];
  recommendedAction:
    | 'continue_with_provider'
    | 'retry_request'
    | 'restart_subprocess_session'
    | 'wait_for_circuit_reset'
    | 'switch_to_fallback_provider'
    | 'switch_to_local_model_provider'
    | 'resume_checkpointed_session'
    | 'manual_reconfigure_provider'
    | 'continue_with_primary_storage'
    | 'continue_with_fallback_storage'
    | 'retry_primary_storage'
    | 'switch_provider'
    | 'manual_recovery'
    | null;
}

export interface ResilienceNotification {
  id: string;
  kind: 'operator_banner' | 'operator_notice' | 'recovery_notice' | 'throttle_recommendation';
  severity: 'info' | 'warning' | 'critical';
  scope: 'storage' | 'provider';
  target: 'storage' | string;
  title: string;
  message: string;
  suggestedAction: ResilienceAuditEvent['recommendedAction'];
  throttleMode: 'serialize_requests' | 'shift_to_fallback' | 'prefer_local_models' | 'pause_mutations' | 'manual_only' | null;
  eventIds: string[];
}

export interface ResilienceThrottleHint {
  id: string;
  scope: 'storage' | 'provider';
  target: 'storage' | string;
  mode: 'serialize_requests' | 'shift_to_fallback' | 'prefer_local_models' | 'pause_mutations' | 'manual_only';
  reason: string;
  action: ResilienceAuditEvent['recommendedAction'];
  eventIds: string[];
}

export interface ResilienceAuditInventory {
  generatedAt: string;
  summary: {
    totalEvents: number;
    openIncidents: number;
    recoveryEvents: number;
    notifications: number;
    throttles: number;
    offlineProviders: number;
    degradedProviders: number;
    storageStatus: 'ready' | 'degraded' | 'offline';
  };
  events: ResilienceAuditEvent[];
  notifications: ResilienceNotification[];
  throttles: ResilienceThrottleHint[];
}

export interface RuntimeFallbackProviderCandidate {
  provider: string;
  status: 'ready' | 'degraded' | 'offline';
  role: 'active_lead' | 'fallback' | 'local_model_fallback' | 'recovery_only';
  priority: number;
  currentModel: string | null;
  defaultModel: string | null;
  supportsCustomModels: boolean;
  supportsLocalModels: boolean;
  reasons: string[];
}

export interface RuntimeFallbackInventory {
  generatedAt: string;
  offlineReady: boolean;
  summary: {
    storageOffline: boolean;
    fallbackCandidateCount: number;
    localModelFallbackCount: number;
    providerOfflineCount: number;
  };
  storage: {
    status: 'ready' | 'degraded' | 'offline';
    effectiveMode: string;
    policyState: string | null;
    failureRatio: number | null;
    reasons: string[];
    fallbackMode: 'none' | 'json_backup' | 'shadow_write' | 'unavailable';
    availableActions: Array<
      'continue_with_primary_storage'
      | 'continue_with_fallback_storage'
      | 'retry_primary_storage'
      | 'switch_provider'
      | 'manual_recovery'
    >;
  };
  providers: {
    lead: string | null;
    leadStatus: 'ready' | 'degraded' | 'offline' | null;
    readyCount: number;
    degradedCount: number;
    offlineCount: number;
    localModelCapableCount: number;
    candidates: RuntimeFallbackProviderCandidate[];
  };
}
