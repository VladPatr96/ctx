import { KBEntrySchema, KBStatsSchema, ClaimGraphSchema, StateSchema, type AppState, type KBEntry, type KBStats, type RoutingHealthData, type ClaimGraphData } from './types';

export interface ApiClient {
  getState(): Promise<AppState>;
  setTask(task: string): Promise<void>;
  setStage(stage: string): Promise<void>;
  searchKb(query: string, limit?: number, project?: string): Promise<KBEntry[]>;
  getKbStats(): Promise<KBStats>;
  getAgentDetails(agentId: string): Promise<string>;
  getTerminalAllowlist(): Promise<string[]>;
  runTerminalCommand(command: string): Promise<TerminalCommandResult>;
  getRoutingHealth(last?: number, sinceDays?: number): Promise<RoutingHealthData>;
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
  setClaimVerdict(claimId: string, verdict: 'true' | 'false' | null): Promise<void>;
  saveKbEntry(entry: Partial<KBEntry>): Promise<void>;
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

  return {
    async getState() {
      const response = await fetch(withToken('/api/state', token), {
        headers: authHeaders
      });
      const payload = await readJson<unknown>(response);
      return StateSchema.parse(payload);
    },

    async setTask(task: string) {
      const response = await fetch(withToken('/api/pipeline/task', token), {
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
      const response = await fetch(withToken('/api/pipeline/stage', token), {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ stage })
      });
      await readJson<unknown>(response);
    },

    async searchKb(query: string, limit = 10, project?: string) {
      const params = new URLSearchParams({ q: query, limit: String(limit) });
      if (project) params.set('project', project);
      const response = await fetch(withToken(`/api/kb/search?${params.toString()}`, token), {
        headers: authHeaders
      });
      const payload = await readJson<{ entries?: unknown[] }>(response);
      return (payload.entries || []).map((entry) => KBEntrySchema.parse(entry));
    },

    async getKbStats() {
      const response = await fetch(withToken('/api/kb/stats', token), {
        headers: authHeaders
      });
      const payload = await readJson<{ stats?: unknown }>(response);
      return KBStatsSchema.parse(payload.stats || {});
    },

    async saveKbEntry(entry: Partial<KBEntry>) {
      const response = await fetch(withToken('/api/kb/save', token), {
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
      const response = await fetch(withToken('/api/agent/details', token), {
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
      const response = await fetch(withToken('/api/terminal/allowlist', token), {
        headers: authHeaders
      });
      const payload = await readJson<{ commands?: string[] }>(response);
      return payload.commands || [];
    },

    async runTerminalCommand(command: string) {
      const response = await fetch(withToken('/api/terminal/run', token), {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ command })
      });
      return readJson<TerminalCommandResult>(response);
    },

    async getRoutingHealth(last = 50, sinceDays = 1) {
      const params = new URLSearchParams({ last: String(last), since_days: String(sinceDays) });
      const response = await fetch(withToken(`/api/routing/health?${params.toString()}`, token), {
        headers: authHeaders
      });
      return readJson<RoutingHealthData>(response);
    },

    async devPipelineRun(specs: DevPipelineSpec[], opts: DevPipelineOpts = {}) {
      const response = await fetch(withToken('/api/dev-pipeline/run', token), {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ specs, ...opts })
      });
      return readJson<DevPipelineReport>(response);
    },

    async devPipelineStatus(pipelineId?: string) {
      const url = pipelineId
        ? `/api/dev-pipeline/status?pipelineId=${encodeURIComponent(pipelineId)}`
        : '/api/dev-pipeline/status';
      const response = await fetch(withToken(url, token), { headers: authHeaders });
      return readJson<DevPipelineReport | DevPipelineReport[]>(response);
    },

    async listTerminalSessions() {
      const response = await fetch(withToken('/api/terminal/sessions', token), { headers: authHeaders });
      const payload = await readJson<{ sessions?: TerminalSession[] }>(response);
      return payload.sessions || [];
    },

    async createTerminalSession(opts: CreateSessionOpts) {
      const response = await fetch(withToken('/api/terminal/session/create', token), {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(opts)
      });
      const payload = await readJson<{ sessionId: string }>(response);
      return payload.sessionId;
    },

    async sendSessionInput(sessionId: string, text: string) {
      const response = await fetch(withToken('/api/terminal/session/input', token), {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, text })
      });
      await readJson<unknown>(response);
    },

    async killTerminalSession(sessionId: string) {
      const response = await fetch(withToken('/api/terminal/session/kill', token), {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      await readJson<unknown>(response);
    },

    async deleteTerminalSession(sessionId: string) {
      const response = await fetch(withToken('/api/terminal/session/delete', token), {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });
      await readJson<unknown>(response);
    },

    getTerminalStreamUrl(sessionId: string) {
      return withToken(`/api/terminal/session/${encodeURIComponent(sessionId)}/stream`, token);
    },

    async getClaimGraph() {
      const response = await fetch(withToken('/api/claims/graph', token), {
        headers: authHeaders
      });
      const payload = await readJson<{ graph?: unknown }>(response);
      if (!payload.graph) return null;
      return ClaimGraphSchema.parse(payload.graph);
    },

    async setClaimVerdict(claimId: string, verdict: 'true' | 'false' | null) {
      const response = await fetch(withToken('/api/claims/verdict', token), {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ claimId, verdict })
      });
      await readJson<unknown>(response);
    }
  };
}

export function createApiClient(tokenInput?: string): ApiClient {
  return createHttpApiClient(tokenInput);
}
