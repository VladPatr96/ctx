/// <reference types="vite/client" />

interface CtxApiBridge {
  getBaseUrl(): Promise<string>;
  getState(): Promise<unknown>;
  setTask(task: string): Promise<void>;
  setStage(stage: string): Promise<void>;
  searchKb(query: string, limit?: number, project?: string): Promise<unknown>;
  getKbStats(): Promise<unknown>;
  getAgentDetails(agentId: string): Promise<unknown>;
  getTerminalAllowlist(): Promise<unknown>;
  runTerminalCommand(command: string): Promise<unknown>;
}

interface Window {
  isElectron?: boolean;
  ctxApi?: CtxApiBridge;
}
