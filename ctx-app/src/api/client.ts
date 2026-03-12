import {
  KBEntrySchema,
  KBStatsSchema,
  KnowledgeContinuityDigestSchema,
  KnowledgeProjectExportSchema,
  KnowledgeQualitySummarySchema,
  KnowledgeSuggestionSummarySchema,
  ClaimGraphSchema,
  ConsiliumObservabilitySchema,
  ConsiliumReplayArchiveSchema,
  ConsiliumReplayExportSchema,
  ShellSummarySchema,
  StateSchema,
  type AnalyticsSummary,
  type AppState,
  type BudgetStatus,
  type ClaimGraphData,
  type ConsiliumObservability,
  type ConsiliumReplayArchive,
  type ConsiliumReplayExport,
  type CostSummary,
  type KBEntry,
  type KBStats,
  type KnowledgeContinuityDigest,
  type KnowledgeProjectExport,
  type KnowledgeQualitySummary,
  type KnowledgeSuggestionSummary,
  type ProviderCostData,
  type ProviderExtensibilityInventory,
  type ProviderRecoveryInventory,
  type Recommendation,
  type ResilienceAuditInventory,
  type RuntimeFallbackInventory,
  type RoutingExplainabilitySummary,
  type RoutingFeedbackPayload,
  type RoutingFeedbackRecord,
  type RoutingHealthData,
  type ShellSummary,
} from './types';
import { getDashboardHttpPath } from '../../../scripts/contracts/dashboard-surface.js';
import { ProviderExtensibilityInventorySchema } from '../../../scripts/contracts/provider-extensibility-schemas.js';
import { ProviderRecoveryInventorySchema } from '../../../scripts/contracts/provider-recovery-schemas.js';
import { ResilienceAuditInventorySchema } from '../../../scripts/contracts/resilience-audit-schemas.js';
import { RuntimeFallbackInventorySchema } from '../../../scripts/contracts/runtime-fallback-schemas.js';

export interface ApiClient {
  getState(): Promise<AppState>;
  setTask(task: string): Promise<void>;
  setStage(stage: string): Promise<void>;
  setLead(lead: string): Promise<void>;
  resetPipeline(): Promise<void>;
  activateConsiliumPreset(preset?: string): Promise<void>;
  setPipelinePlan(selected: number): Promise<void>;
  searchKb(query: string, limit?: number, project?: string): Promise<KBEntry[]>;
  getKbStats(): Promise<KBStats>;
  getKbContinuity(project: string, limit?: number): Promise<KnowledgeContinuityDigest>;
  getKbQuality(staleDays?: number): Promise<KnowledgeQualitySummary>;
  getKbExport(project: string, limit?: number, staleDays?: number): Promise<KnowledgeProjectExport>;
  getKbSuggestions(project: string, limit?: number): Promise<KnowledgeSuggestionSummary>;
  getShellSummary(): Promise<ShellSummary>;
  getProviderExtensibility(): Promise<ProviderExtensibilityInventory>;
  getProviderRecovery(): Promise<ProviderRecoveryInventory>;
  getRuntimeResilience(): Promise<ResilienceAuditInventory>;
  getRuntimeFallbacks(): Promise<RuntimeFallbackInventory>;
  getAgentDetails(agentId: string): Promise<string>;
  getTerminalAllowlist(): Promise<string[]>;
  runTerminalCommand(command: string): Promise<TerminalCommandResult>;
  getRoutingHealth(last?: number, sinceDays?: number): Promise<RoutingHealthData>;
  getRoutingExplainability(last?: number, sinceDays?: number): Promise<RoutingExplainabilitySummary>;
  submitRoutingFeedback(payload: RoutingFeedbackPayload): Promise<RoutingFeedbackRecord>;
  devPipelineRun(specs: DevPipelineSpec[], opts?: DevPipelineOpts): Promise<DevPipelineReport>;
  devPipelineStatus(pipelineId?: string): Promise<DevPipelineReport | DevPipelineReport[]>;
  // Orchestrator terminal sessions
  listTerminalSessions(): Promise<TerminalSession[]>;
  createTerminalSession(opts: CreateSessionOpts): Promise<string>;
  sendSessionInput(sessionId: string, text: string): Promise<void>;
  killTerminalSession(sessionId: string): Promise<void>;
  deleteTerminalSession(sessionId: string): Promise<void>;
  getTerminalStreamUrl(sessionId: string): string;
  // Claim graph
  getClaimGraph(): Promise<ClaimGraphData | null>;
  getConsiliumObservability(): Promise<ConsiliumObservability | null>;
  getConsiliumReplay(last?: number, options?: ConsiliumReplayQuery): Promise<ConsiliumReplayArchive>;
  exportConsiliumReplay(runId: string, format: 'markdown' | 'json', options?: ConsiliumReplayQuery): Promise<ConsiliumReplayExport>;
  setClaimVerdict(claimId: string, verdict: 'true' | 'false' | null): Promise<void>;
  saveKbEntry(entry: Partial<KBEntry>): Promise<void>;
  // Cost tracking
  getCostSummary(): Promise<CostSummary>;
  getCostsByProvider(): Promise<Record<string, ProviderCostData>>;
  getRecommendations(): Promise<Recommendation[]>;
  getBudgetStatus(): Promise<BudgetStatus>;
  getAnalyticsSummary(): Promise<AnalyticsSummary>;
}

export interface DevPipelineSpec {
  agentId: string;
  task: string;
  provider: string;
  priority?: number;
}

export interface DevPipelineOpts {
  baseBranch?: string;
  testCommand?: string | string[];
  testTimeout?: number;
  stopOnTestFail?: boolean;
  conflictResolution?: boolean;
  conflictProvider?: string;
}

export interface DevPipelineReport {
  pipelineId: string;
  status: string;
  startedAt: string;
  completedAt: string | null;
  durationMs: number;
  integrationBranch: string;
  error?: string;
  phases: {
    execute: { status: string; durationMs: number; summary: Record<string, number> } | null;
    merges: Array<{ agentId: string; success: boolean; conflicts: boolean; mergedCommits: number; reverted?: boolean }>;
    verify: { success: boolean; skipped: boolean; output: string; durationMs: number } | null;
  };
  agents: Record<string, {
    execution?: { status: string; durationMs: number };
    merge?: { success: boolean; conflicts: boolean; mergedCommits: number; reverted?: boolean };
    tests?: { success: boolean; skipped: boolean; output: string; durationMs: number };
    conflictResolution?: { success: boolean; filesResolved: string[]; reasoning: string };
  }>;
  summary: {
    total: number;
    executed: number;
    merged: number;
    skipped: number;
    failed: number;
    testsPassed: boolean;
  };
}

export interface TerminalCommandResult {
  ok: boolean;
  command: string;
  stdout: string;
  stderr: string;
  code: number;
  durationMs: number;
  error?: string;
}

export interface TerminalSession {
  id: string;
  provider: string;
  model: string;
  label: string;
  branch: string;
  status: 'starting' | 'running' | 'idle' | 'done' | 'error';
  startedAt: number;
  ringSize: number;
}

export interface CreateSessionOpts {
  provider: string;
  model?: string;
  task?: string;
  label?: string;
  branch?: string;
  cwd?: string;
}

export type TerminalLine = {
  ts: string;
  type: 'stdout' | 'stderr' | 'system';
  text: string;
};


function readTokenFromEnv(): string {
  const query = new URLSearchParams(window.location.search);
  const fromUrl = query.get('token');
  if (fromUrl) {
    localStorage.setItem('ctx-dashboard-token', fromUrl);
    return fromUrl;
  }
  const fromStorage = localStorage.getItem('ctx-dashboard-token');
  if (fromStorage) return fromStorage;
  // Token injected by dashboard-backend into index.html
  const fromWindow = (window as unknown as Record<string, string>).__CTX_TOKEN__;
  if (fromWindow) return fromWindow;
  return ((import.meta as ImportMeta & { env?: Record<string, string> }).env?.VITE_CTX_TOKEN as string | undefined) || '';
}

function withToken(path: string, token: string) {
  if (!token) return path;
  return `${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const payload = await response.json();
      if (payload?.error) message = payload.error;
    } catch {
      // Keep default message.
    }
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function createHttpApiClient(tokenInput?: string): ApiClient {
  const token = tokenInput ?? readTokenFromEnv();
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const terminalBridge = window.isElectron && window.ctxApi ? window.ctxApi : null;

  return {
    async getState() {
      const response = await fetch(withToken(getDashboardHttpPath('state'), token), {
        headers: authHeaders
      });
      const payload = await readJson<unknown>(response);
      return StateSchema.parse(payload);
    },

    async setTask(task: string) {
      const response = await fetch(withToken(getDashboardHttpPath('pipelineTask'), token), {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ task })
      });
      await readJson<unknown>(response);
    },

    async setStage(stage: string) {
      const response = await fetch(withToken(getDashboardHttpPath('pipelineStage'), token), {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ stage })
      });
      await readJson<unknown>(response);
    },

    async setLead(lead: string) {
      const response = await fetch(withToken(getDashboardHttpPath('pipelineLead'), token), {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ lead })
      });
      await readJson<unknown>(response);
    },

    async resetPipeline() {
      const response = await fetch(withToken(getDashboardHttpPath('pipelineReset'), token), {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({})
      });
      await readJson<unknown>(response);
    },

    async activateConsiliumPreset(preset?: string) {
      const response = await fetch(withToken(getDashboardHttpPath('consiliumActivate'), token), {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(preset ? { preset } : {})
      });
      await readJson<unknown>(response);
    },

    async setPipelinePlan(selected: number) {
      const response = await fetch(withToken(getDashboardHttpPath('pipelinePlan'), token), {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ plan: selected })
      });
      await readJson<unknown>(response);
    },

    async searchKb(query: string, limit = 10, project?: string) {
      const params = new URLSearchParams({ q: query, limit: String(limit) });
      if (project) params.set('project', project);
      const response = await fetch(withToken(`${getDashboardHttpPath('kbSearch')}?${params.toString()}`, token), {
        headers: authHeaders
      });
      const payload = await readJson<{ entries?: unknown[] }>(response);
      return (payload.entries || []).map((entry) => KBEntrySchema.parse(entry));
    },

    async getKbStats() {
      const response = await fetch(withToken(getDashboardHttpPath('kbStats'), token), {
        headers: authHeaders
      });
      const payload = await readJson<{ stats?: unknown }>(response);
      return KBStatsSchema.parse(payload.stats || {});
    },

    async getKbContinuity(project: string, limit = 5) {
      const path = getDashboardHttpPath('kbContinuity', { project });
      const response = await fetch(withToken(`${path}?limit=${encodeURIComponent(String(limit))}`, token), {
        headers: authHeaders
      });
      const payload = await readJson<{ digest?: unknown }>(response);
      return KnowledgeContinuityDigestSchema.parse(payload.digest || {});
    },

    async getKbQuality(staleDays = 30) {
      const response = await fetch(withToken(`${getDashboardHttpPath('kbQuality')}?stale_days=${encodeURIComponent(String(staleDays))}`, token), {
        headers: authHeaders
      });
      const payload = await readJson<{ summary?: unknown }>(response);
      return KnowledgeQualitySummarySchema.parse(payload.summary || {});
    },

    async getKbExport(project: string, limit = 5, staleDays = 30) {
      const path = getDashboardHttpPath('kbExport', { project });
      const response = await fetch(withToken(`${path}?limit=${encodeURIComponent(String(limit))}&stale_days=${encodeURIComponent(String(staleDays))}`, token), {
        headers: authHeaders
      });
      const payload = await readJson<{ artifact?: unknown }>(response);
      return KnowledgeProjectExportSchema.parse(payload.artifact || {});
    },

    async getKbSuggestions(project: string, limit = 5) {
      const path = getDashboardHttpPath('kbSuggestions', { project });
      const response = await fetch(withToken(`${path}?limit=${encodeURIComponent(String(limit))}`, token), {
        headers: authHeaders
      });
      const payload = await readJson<{ summary?: unknown }>(response);
      return KnowledgeSuggestionSummarySchema.parse(payload.summary || {});
    },

    async getShellSummary() {
      const response = await fetch(withToken(getDashboardHttpPath('shellSummary'), token), {
        headers: authHeaders
      });
      const payload = await readJson<{ summary?: unknown }>(response);
      return ShellSummarySchema.parse(payload.summary || {});
    },

    async getProviderExtensibility() {
      const response = await fetch(withToken(getDashboardHttpPath('providersExtensibility'), token), {
        headers: authHeaders
      });
      const payload = await readJson<{ inventory?: unknown }>(response);
      return ProviderExtensibilityInventorySchema.parse(payload.inventory || {});
    },

    async getProviderRecovery() {
      const response = await fetch(withToken(getDashboardHttpPath('providersRecovery'), token), {
        headers: authHeaders
      });
      const payload = await readJson<{ inventory?: unknown }>(response);
      return ProviderRecoveryInventorySchema.parse(payload.inventory || {});
    },

    async getRuntimeResilience() {
      const response = await fetch(withToken(getDashboardHttpPath('runtimeResilience'), token), {
        headers: authHeaders
      });
      const payload = await readJson<{ inventory?: unknown }>(response);
      return ResilienceAuditInventorySchema.parse(payload.inventory || {});
    },

    async getRuntimeFallbacks() {
      const response = await fetch(withToken(getDashboardHttpPath('runtimeFallbacks'), token), {
        headers: authHeaders
      });
      const payload = await readJson<{ inventory?: unknown }>(response);
      return RuntimeFallbackInventorySchema.parse(payload.inventory || {});
    },

    async saveKbEntry(entry: Partial<KBEntry>) {
      const response = await fetch(withToken(getDashboardHttpPath('kbSave'), token), {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(entry)
      });
      if (response.status !== 404) {
        await readJson<unknown>(response);
      } else {
        // Fallback for mock if backend isn't ready
        console.warn('Backend /api/kb/save not found, mocking success.');
        await new Promise(r => setTimeout(r, 400));
      }
    },

    async getAgentDetails(agentId: string) {
      const response = await fetch(withToken(getDashboardHttpPath('agentDetails'), token), {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ id: agentId })
      });
      const payload = await readJson<{ content?: string }>(response);
      return payload.content || '';
    },

    async getTerminalAllowlist() {
      if (!terminalBridge?.getTerminalAllowlist) {
        return [];
      }
      const payload = await terminalBridge.getTerminalAllowlist();
      return Array.isArray(payload)
        ? payload.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        : [];
    },

    async runTerminalCommand(command: string) {
      if (!terminalBridge?.runTerminalCommand) {
        throw new Error('Terminal command execution requires Electron desktop mode.');
      }
      const payload = await terminalBridge.runTerminalCommand(command);
      return normalizeTerminalCommandResult(payload, command);
    },

    async getRoutingHealth(last = 50, sinceDays = 1) {
      const params = new URLSearchParams({ last: String(last), since_days: String(sinceDays) });
      const response = await fetch(withToken(`${getDashboardHttpPath('routingHealth')}?${params.toString()}`, token), {
        headers: authHeaders
      });
      return readJson<RoutingHealthData>(response);
    },

    async getRoutingExplainability(last = 20, sinceDays = 7) {
      const params = new URLSearchParams({ last: String(last), since_days: String(sinceDays) });
      const response = await fetch(withToken(`${getDashboardHttpPath('routingExplainability')}?${params.toString()}`, token), {
        headers: authHeaders
      });
      const payload = await readJson<{ summary: RoutingExplainabilitySummary }>(response);
      return payload.summary;
    },

    async submitRoutingFeedback(payload: RoutingFeedbackPayload) {
      const response = await fetch(withToken(getDashboardHttpPath('routingFeedback'), token), {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });
      const result = await readJson<{ record: RoutingFeedbackRecord }>(response);
      return result.record;
    },

    async devPipelineRun(specs: DevPipelineSpec[], opts: DevPipelineOpts = {}) {
      const response = await fetch(withToken(getDashboardHttpPath('devPipelineRun'), token), {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ specs, ...opts })
      });
      return readJson<DevPipelineReport>(response);
    },

    async devPipelineStatus(pipelineId?: string) {
      const url = pipelineId
        ? `${getDashboardHttpPath('devPipelineStatus')}?pipelineId=${encodeURIComponent(pipelineId)}`
        : getDashboardHttpPath('devPipelineStatus');
      const response = await fetch(withToken(url, token), { headers: authHeaders });
      return readJson<DevPipelineReport | DevPipelineReport[]>(response);
    },

    async listTerminalSessions() {
      const response = await fetch(withToken(getDashboardHttpPath('terminalSessions'), token), { headers: authHeaders });
      const payload = await readJson<{ sessions?: TerminalSession[] }>(response);
      return payload.sessions || [];
    },

    async createTerminalSession(opts: CreateSessionOpts) {
      const response = await fetch(withToken(getDashboardHttpPath('terminalSessionCreate'), token), {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(opts)
      });
      const payload = await readJson<{ sessionId: string }>(response);
      return payload.sessionId;
    },

    async sendSessionInput(sessionId: string, text: string) {
      const response = await fetch(withToken(getDashboardHttpPath('terminalSessionInput'), token), {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, text })
      });
      await readJson<unknown>(response);
    },

    async killTerminalSession(sessionId: string) {
      const response = await fetch(withToken(getDashboardHttpPath('terminalSessionKill'), token), {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      await readJson<unknown>(response);
    },

    async deleteTerminalSession(sessionId: string) {
      const response = await fetch(withToken(getDashboardHttpPath('terminalSessionDelete'), token), {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      await readJson<unknown>(response);
    },

    getTerminalStreamUrl(sessionId: string) {
      return withToken(getDashboardHttpPath('terminalSessionStream', { sessionId }), token);
    },

    async getClaimGraph() {
      const response = await fetch(withToken(getDashboardHttpPath('claimGraph'), token), {
        headers: authHeaders
      });
      const payload = await readJson<{ graph?: unknown }>(response);
      if (!payload.graph) return null;
      return ClaimGraphSchema.parse(payload.graph);
    },

    async getConsiliumObservability() {
      const response = await fetch(withToken(getDashboardHttpPath('consiliumObservability'), token), {
        headers: authHeaders
      });
      const payload = await readJson<{ observability?: unknown }>(response);
      if (!payload.observability) return null;
      return ConsiliumObservabilitySchema.parse(payload.observability);
    },

    async getConsiliumReplay(last = 8, options: ConsiliumReplayQuery = {}) {
      const params = new URLSearchParams({ last: String(last) });
      if (options.runId) params.set('run_id', options.runId);
      if (options.project) params.set('project', options.project);
      if (options.provider) params.set('provider', options.provider);
      if (options.consensus) params.set('consensus', options.consensus);

      const response = await fetch(withToken(`${getDashboardHttpPath('consiliumReplay')}?${params.toString()}`, token), {
        headers: authHeaders
      });
      const payload = await readJson<{ archive?: unknown }>(response);
      return ConsiliumReplayArchiveSchema.parse(payload.archive || {});
    },

    async exportConsiliumReplay(runId: string, format: 'markdown' | 'json', options: ConsiliumReplayQuery = {}) {
      const params = new URLSearchParams({
        run_id: runId,
        format,
      });
      if (options.project) params.set('project', options.project);
      if (options.provider) params.set('provider', options.provider);
      if (options.consensus) params.set('consensus', options.consensus);

      const response = await fetch(withToken(`${getDashboardHttpPath('consiliumReplayExport')}?${params.toString()}`, token), {
        headers: authHeaders
      });
      const payload = await readJson<{ export?: unknown }>(response);
      return ConsiliumReplayExportSchema.parse(payload.export || {});
    },

    async setClaimVerdict(claimId: string, verdict: 'true' | 'false' | null) {
      const response = await fetch(withToken(getDashboardHttpPath('claimVerdict'), token), {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ claimId, verdict })
      });
      await readJson<unknown>(response);
    },

    async getCostSummary() {
      const response = await fetch(withToken(getDashboardHttpPath('costSummary'), token), {
        headers: authHeaders
      });
      const payload = await readJson<{ summary?: CostSummary }>(response);
      return payload.summary || { totalCost: 0, totalRequests: 0, costPerRequest: 0, providers: {} };
    },

    async getCostsByProvider() {
      const response = await fetch(withToken(getDashboardHttpPath('costByProvider'), token), {
        headers: authHeaders
      });
      const payload = await readJson<{ providers?: Record<string, ProviderCostData> }>(response);
      return payload.providers || {};
    },

    async getRecommendations() {
      const response = await fetch(withToken(getDashboardHttpPath('costRecommendations'), token), {
        headers: authHeaders
      });
      const payload = await readJson<{ recommendations?: Recommendation[] }>(response);
      return payload.recommendations || [];
    },

    async getBudgetStatus() {
      const response = await fetch(withToken(getDashboardHttpPath('costBudget'), token), {
        headers: authHeaders
      });
      const payload = await readJson<{ config?: BudgetStatus['config']; status?: BudgetStatus['status'] }>(response);
      return {
        config: payload.config || {},
        status: payload.status || {}
      };
    },

    async getAnalyticsSummary() {
      const response = await fetch(withToken(getDashboardHttpPath('analyticsSummary'), token), {
        headers: authHeaders
      });
      const payload = await readJson<{ summary?: AnalyticsSummary }>(response);
      return payload.summary || createEmptyAnalyticsSummary();
    }
  };
}

export interface ConsiliumReplayQuery {
  runId?: string;
  project?: string;
  provider?: string;
  consensus?: 'all' | 'consensus' | 'open';
}

export function createApiClient(tokenInput?: string): ApiClient {
  return createHttpApiClient(tokenInput);
}

function normalizeTerminalCommandResult(payload: unknown, fallbackCommand: string): TerminalCommandResult {
  const record = isRecord(payload) ? payload : {};

  return {
    ok: record.ok === true,
    command: normalizeString(record.command, fallbackCommand),
    stdout: normalizeString(record.stdout),
    stderr: normalizeString(record.stderr),
    code: normalizeInteger(record.code),
    durationMs: normalizeInteger(record.durationMs),
    error: normalizeOptionalString(record.error),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function normalizeString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function normalizeOptionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function normalizeInteger(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0;
}

function createEmptyAnalyticsSummary(): AnalyticsSummary {
  return {
    generatedAt: new Date(0).toISOString(),
    totals: {
      totalCost: 0,
      totalRequests: 0,
      totalTokens: 0,
      providerCount: 0,
      costPerRequest: 0,
      projectedMonthlyCost: 0,
      projectionConfidence: 'none',
    },
    providers: [],
    timeline: {
      granularity: 'day',
      days: 7,
      points: [],
    },
    recommendations: [],
    budget: {
      hasAlerts: false,
      thresholds: {
        warning: 0.8,
        critical: 0.95,
      },
      global: null,
      providers: [],
    },
    routing: {
      available: false,
      totalDecisions: 0,
      anomalyCount: 0,
      divergedCount: 0,
      dominantProvider: null,
      lastDecisionAt: null,
    },
    gaps: [],
  };
}
