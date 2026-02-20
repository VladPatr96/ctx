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
  message: z.string().optional()
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

export const StateSchema = z.object({
  pipeline: PipelineSchema.default({ stage: 'detect', lead: 'codex', task: null }),
  log: z.array(LogEntrySchema).default([]),
  agents: z.array(AgentSchema).default([]),
  consilium: z.array(ConsiliumPresetSchema).default([]),
  results: z.array(ConsiliumResultSchema).default([]),
  storageHealth: z.any().nullable().optional(),
  providerHealth: z.record(ProviderHealthEntrySchema).default({}),
  project: z.any().optional()
}).passthrough();

export type PipelineState = z.infer<typeof PipelineSchema>;
export type AppState = z.infer<typeof StateSchema>;
export type KBEntry = z.infer<typeof KBEntrySchema>;
export type KBStats = z.infer<typeof KBStatsSchema>;
export type Agent = z.infer<typeof AgentSchema>;
export type ConsiliumPreset = z.infer<typeof ConsiliumPresetSchema>;
export type ConsiliumResult = z.infer<typeof ConsiliumResultSchema>;
export type ProviderHealthEntry = z.infer<typeof ProviderHealthEntrySchema>;
