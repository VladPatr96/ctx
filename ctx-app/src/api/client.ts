import { KBEntrySchema, KBStatsSchema, StateSchema, type AppState, type KBEntry, type KBStats, type RoutingHealthData, type CostSummary, type ProviderCostData, type Recommendation, type BudgetStatus } from './types';

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
  getCostSummary(): Promise<CostSummary>;
  getCostsByProvider(): Promise<Record<string, ProviderCostData>>;
  getRecommendations(): Promise<Recommendation[]>;
  getBudgetStatus(): Promise<BudgetStatus>;
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


function readTokenFromEnv(): string {
  const query = new URLSearchParams(window.location.search);
  const fromUrl = query.get('token');
  if (fromUrl) {
    localStorage.setItem('ctx-dashboard-token', fromUrl);
    return fromUrl;
  }
  const fromStorage = localStorage.getItem('ctx-dashboard-token');
  if (fromStorage) return fromStorage;
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

    async getCostSummary() {
      const response = await fetch(withToken('/api/cost/summary', token), {
        headers: authHeaders
      });
      const payload = await readJson<{ summary?: CostSummary }>(response);
      return payload.summary || { totalCost: 0, totalRequests: 0, costPerRequest: 0, providers: {} };
    },

    async getCostsByProvider() {
      const response = await fetch(withToken('/api/cost/by-provider', token), {
        headers: authHeaders
      });
      const payload = await readJson<{ providers?: Record<string, ProviderCostData> }>(response);
      return payload.providers || {};
    },

    async getRecommendations() {
      const response = await fetch(withToken('/api/cost/recommendations', token), {
        headers: authHeaders
      });
      const payload = await readJson<{ recommendations?: Recommendation[] }>(response);
      return payload.recommendations || [];
    },

    async getBudgetStatus() {
      const response = await fetch(withToken('/api/cost/budget', token), {
        headers: authHeaders
      });
      const payload = await readJson<{ config?: BudgetStatus['config']; status?: BudgetStatus['status'] }>(response);
      return {
        config: payload.config || {},
        status: payload.status || {}
      };
    }
  };
}

export function createApiClient(tokenInput?: string): ApiClient {
  return createHttpApiClient(tokenInput);
}
