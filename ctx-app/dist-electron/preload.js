import { contextBridge as o, ipcRenderer as t } from "electron";
o.exposeInMainWorld("ipcRenderer", {
  on(...e) {
    const [n, i] = e;
    return t.on(n, (a, ...r) => i(a, ...r));
  },
  off(...e) {
    const [n, ...i] = e;
    return t.off(n, ...i);
  },
  send(...e) {
    const [n, ...i] = e;
    return t.send(n, ...i);
  },
  invoke(...e) {
    const [n, ...i] = e;
    return t.invoke(n, ...i);
  },
  // Custom APIs
  getEnv: () => t.invoke("get-env")
});
o.exposeInMainWorld("ctxApi", {
  getBaseUrl: () => t.invoke("ctx-api:get-base-url"),
  getState: () => t.invoke("ctx-api:get-state"),
  setTask: (e) => t.invoke("ctx-api:set-task", e),
  setStage: (e) => t.invoke("ctx-api:set-stage", e),
  searchKb: (e, n, i) => t.invoke("ctx-api:search-kb", e, n, i),
  getKbStats: () => t.invoke("ctx-api:get-kb-stats"),
  getAgentDetails: (e) => t.invoke("ctx-api:get-agent-details", e),
  getTerminalAllowlist: () => t.invoke("ctx-terminal:get-allowlist"),
  runTerminalCommand: (e) => t.invoke("ctx-terminal:run", e)
});
o.exposeInMainWorld("isElectron", !0);
