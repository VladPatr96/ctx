import { KBEntrySchema, KBStatsSchema, StateSchema, type AppState, type KBEntry, type KBStats } from './types';

export interface ApiClient {
  getState(): Promise<AppState>;
  setTask(task: string): Promise<void>;
  setStage(stage: string): Promise<void>;
  searchKb(query: string, limit?: number, project?: string): Promise<KBEntry[]>;
  getKbStats(): Promise<KBStats>;
  getAgentDetails(agentId: string): Promise<string>;
  getTerminalAllowlist(): Promise<string[]>;
  runTerminalCommand(command: string): Promise<TerminalCommandResult>;
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

interface CtxApiBridge {
  getState(): Promise<unknown>;
  setTask(task: string): Promise<void>;
  setStage(stage: string): Promise<void>;
  searchKb(query: string, limit?: number, project?: string): Promise<unknown>;
  getKbStats(): Promise<unknown>;
  getAgentDetails(agentId: string): Promise<unknown>;
  getTerminalAllowlist(): Promise<unknown>;
  runTerminalCommand(command: string): Promise<unknown>;
}

function readElectronBridge(): CtxApiBridge | null {
  const maybe = window as Window & { isElectron?: boolean; ctxApi?: CtxApiBridge };
  if (!maybe.isElectron || !maybe.ctxApi) return null;
  return maybe.ctxApi;
}

function toObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {};
  return value as Record<string, unknown>;
}

function toTerminalResult(payload: unknown): TerminalCommandResult {
  const obj = toObject(payload);
  return {
    ok: Boolean(obj.ok),
    command: typeof obj.command === 'string' ? obj.command : '',
    stdout: typeof obj.stdout === 'string' ? obj.stdout : '',
    stderr: typeof obj.stderr === 'string' ? obj.stderr : '',
    code: Number.isFinite(Number(obj.code)) ? Number(obj.code) : -1,
    durationMs: Number.isFinite(Number(obj.durationMs)) ? Number(obj.durationMs) : 0,
    error: typeof obj.error === 'string' ? obj.error : undefined
  };
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
      return [];
    },

    async runTerminalCommand() {
      throw new Error('Terminal is available only in Electron mode');
    }
  };
}

function createElectronApiClient(bridge: CtxApiBridge): ApiClient {
  return {
    async getState() {
      const payload = await bridge.getState();
      return StateSchema.parse(payload);
    },

    async setTask(task: string) {
      await bridge.setTask(task);
    },

    async setStage(stage: string) {
      await bridge.setStage(stage);
    },

    async searchKb(query: string, limit = 10, project?: string) {
      const payload = toObject(await bridge.searchKb(query, limit, project));
      const entries = Array.isArray(payload.entries) ? payload.entries : [];
      return entries.map((entry) => KBEntrySchema.parse(entry));
    },

    async getKbStats() {
      const payload = toObject(await bridge.getKbStats());
      return KBStatsSchema.parse(payload.stats || {});
    },

    async getAgentDetails(agentId: string) {
      const payload = toObject(await bridge.getAgentDetails(agentId));
      return typeof payload.content === 'string' ? payload.content : '';
    },

    async getTerminalAllowlist() {
      const payload = await bridge.getTerminalAllowlist();
      return Array.isArray(payload) ? payload.filter((item): item is string => typeof item === 'string') : [];
    },

    async runTerminalCommand(command: string) {
      return toTerminalResult(await bridge.runTerminalCommand(command));
    }
  };
}

export function createApiClient(tokenInput?: string): ApiClient {
  const bridge = readElectronBridge();
  if (bridge) return createElectronApiClient(bridge);
  return createHttpApiClient(tokenInput);
}
