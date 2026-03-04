import { z } from 'zod';

export const StageSchema = z.enum([
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
  access_count: z.number().optional()
}).passthrough();

export const KBStatsSchema = z.object({
  total: z.number().default(0),
  byCategory: z.record(z.number()).default({}),
  byProject: z.record(z.number()).default({})
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

export const StateSchema = z.object({
  pipeline: PipelineSchema.default({ stage: 'detect', lead: 'codex', task: null }),
  log: z.array(LogEntrySchema).default([]),
  agents: z.array(AgentSchema).default([]),
  consilium: z.array(ConsiliumPresetSchema).default([]),
  results: z.array(ConsiliumResultSchema).default([]),
  storageHealth: z.any().nullable().optional(),
  providerHealth: z.record(ProviderHealthEntrySchema).default({}),
  project: z.any().optional(),
  claimGraph: ClaimGraphSchema.nullable().optional()
}).passthrough();

export type PipelineState = z.infer<typeof PipelineSchema>;
export type AppState = z.infer<typeof StateSchema>;
export type KBEntry = z.infer<typeof KBEntrySchema>;
export type KBStats = z.infer<typeof KBStatsSchema>;
export type Agent = z.infer<typeof AgentSchema>;
export type ConsiliumPreset = z.infer<typeof ConsiliumPresetSchema>;
export type ConsiliumResult = z.infer<typeof ConsiliumResultSchema>;
export type ProviderHealthEntry = z.infer<typeof ProviderHealthEntrySchema>;
export type RoutingDecision = z.infer<typeof RoutingDecisionSchema>;
export type RoutingAnomaly = z.infer<typeof RoutingAnomalySchema>;
export type ClaimGraphData = z.infer<typeof ClaimGraphSchema>;
export type ClaimPosition = z.infer<typeof ClaimPositionSchema>;
