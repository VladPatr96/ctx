import { contextBridge, ipcRenderer } from "electron";
contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args) {
    const [channel, listener] = args;
    return ipcRenderer.on(channel, (event, ...args2) => listener(event, ...args2));
  },
  off(...args) {
    const [channel, ...omit] = args;
    return ipcRenderer.off(channel, ...omit);
  },
  send(...args) {
    const [channel, ...omit] = args;
    return ipcRenderer.send(channel, ...omit);
  },
  invoke(...args) {
    const [channel, ...omit] = args;
    return ipcRenderer.invoke(channel, ...omit);
  },
  // Custom APIs
  getEnv: () => ipcRenderer.invoke("get-env")
});
contextBridge.exposeInMainWorld("ctxApi", {
  getBaseUrl: () => ipcRenderer.invoke("ctx-api:get-base-url"),
  getState: () => ipcRenderer.invoke("ctx-api:get-state"),
  setTask: (task) => ipcRenderer.invoke("ctx-api:set-task", task),
  setStage: (stage) => ipcRenderer.invoke("ctx-api:set-stage", stage),
  searchKb: (query, limit, project) => ipcRenderer.invoke("ctx-api:search-kb", query, limit, project),
  getKbStats: () => ipcRenderer.invoke("ctx-api:get-kb-stats"),
  getAgentDetails: (agentId) => ipcRenderer.invoke("ctx-api:get-agent-details", agentId),
  getTerminalAllowlist: () => ipcRenderer.invoke("ctx-terminal:get-allowlist"),
  runTerminalCommand: (command) => ipcRenderer.invoke("ctx-terminal:run", command)
});
contextBridge.exposeInMainWorld("isElectron", true);
