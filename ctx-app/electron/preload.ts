import { contextBridge, ipcRenderer } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // Custom APIs
  getEnv: () => ipcRenderer.invoke('get-env'),
})

contextBridge.exposeInMainWorld('ctxApi', {
  getBaseUrl: () => ipcRenderer.invoke('ctx-api:get-base-url') as Promise<string>,
  getState: () => ipcRenderer.invoke('ctx-api:get-state'),
  setTask: (task: string) => ipcRenderer.invoke('ctx-api:set-task', task) as Promise<void>,
  setStage: (stage: string) => ipcRenderer.invoke('ctx-api:set-stage', stage) as Promise<void>,
  searchKb: (query: string, limit?: number, project?: string) => ipcRenderer.invoke('ctx-api:search-kb', query, limit, project),
  getKbStats: () => ipcRenderer.invoke('ctx-api:get-kb-stats'),
  getAgentDetails: (agentId: string) => ipcRenderer.invoke('ctx-api:get-agent-details', agentId),
  getTerminalAllowlist: () => ipcRenderer.invoke('ctx-terminal:get-allowlist'),
  runTerminalCommand: (command: string) => ipcRenderer.invoke('ctx-terminal:run', command),
})

// Add isElectron flag
contextBridge.exposeInMainWorld('isElectron', true)
