import { app as u, BrowserWindow as S, ipcMain as i } from "electron";
import { fileURLToPath as I } from "node:url";
import c from "node:path";
import { existsSync as L, readFileSync as P } from "node:fs";
import { spawn as B } from "node:child_process";
const C = /[|&;<>`$]/, b = Object.freeze({
  node: [["-v"], ["--version"]],
  npm: [["test"], ["run", "test"], ["run", "build"]],
  git: [["status"], ["status", "--short"], ["branch", "--show-current"]]
});
function $(n) {
  const e = String(n || "").trim().toLowerCase();
  return e === "node.exe" ? "node" : e === "npm.cmd" || e === "npm.exe" ? "npm" : e === "git.exe" ? "git" : e;
}
function j() {
  return Object.entries(b).flatMap(([n, e]) => e.map((t) => `${n} ${t.join(" ")}`.trim()));
}
function N(n, e = process.platform) {
  const t = String(n || "").trim();
  if (!t) throw new Error("command is empty");
  if (t.length > 160) throw new Error("command is too long");
  if (C.test(t) || t.includes(`
`) || t.includes("\r"))
    throw new Error("command contains forbidden characters");
  const r = t.split(/\s+/).filter(Boolean);
  if (r.length === 0) throw new Error("command is empty");
  const o = $(r[0]), s = r.slice(1), h = b[o];
  if (!h) throw new Error(`command is not allowlisted: ${o}`);
  if (!h.some((f) => f.length === s.length && f.every((w, a) => w === s[a]))) throw new Error(`arguments are not allowlisted for ${o}`);
  return { bin: e === "win32" && o === "npm" ? "npm.cmd" : o, args: s, normalized: `${o} ${s.join(" ")}`.trim() };
}
const y = c.dirname(I(import.meta.url));
process.env.APP_ROOT = c.join(y, "..");
const _ = process.env.VITE_DEV_SERVER_URL, J = c.join(process.env.APP_ROOT, "dist-electron"), v = c.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = _ ? c.join(process.env.APP_ROOT, "public") : v;
let d;
const g = process.env.CTX_DASHBOARD_URL || "http://127.0.0.1:7331", O = process.env.CTX_DASHBOARD_TOKEN_FILE || c.join(process.cwd(), ".data", ".dashboard-token"), k = 6e4, A = 64 * 1024;
function M() {
  if (process.env.CTX_DASHBOARD_TOKEN) return process.env.CTX_DASHBOARD_TOKEN;
  try {
    return L(O) ? P(O, "utf8").trim() : "";
  } catch {
    return "";
  }
}
function U(n) {
  return `${g.endsWith("/") ? g.slice(0, -1) : g}${n.startsWith("/") ? n : `/${n}`}`;
}
async function p(n, e) {
  const t = new Headers((e == null ? void 0 : e.headers) || {}), r = M();
  r && !t.has("Authorization") && t.set("Authorization", `Bearer ${r}`), e != null && e.body && !t.has("Content-Type") && t.set("Content-Type", "application/json");
  const o = await fetch(U(n), {
    ...e,
    headers: t
  }), s = await o.json().catch(() => ({}));
  if (!o.ok)
    throw new Error(s.error || `${o.status} ${o.statusText}`);
  return s;
}
function R(n, e) {
  if (!e) return n;
  const t = n + e;
  return t.length <= A ? t : t.slice(t.length - A);
}
function V(n) {
  const e = Date.now();
  let t;
  try {
    t = N(n, process.platform);
  } catch (r) {
    return Promise.resolve({
      ok: !1,
      command: n.trim(),
      stdout: "",
      stderr: "",
      code: -1,
      durationMs: Date.now() - e,
      error: r instanceof Error ? r.message : String(r)
    });
  }
  return new Promise((r) => {
    let o = "", s = "", h = !1, l = !1;
    const m = B(t.bin, t.args, {
      cwd: process.cwd(),
      shell: !1,
      windowsHide: !0
    }), f = setTimeout(() => {
      l = !0, m.kill();
    }, k), w = (a) => {
      h || (h = !0, clearTimeout(f), r(a));
    };
    m.stdout.on("data", (a) => {
      o = R(o, a.toString());
    }), m.stderr.on("data", (a) => {
      s = R(s, a.toString());
    }), m.on("error", (a) => {
      w({
        ok: !1,
        command: t.normalized,
        stdout: o,
        stderr: s,
        code: -1,
        durationMs: Date.now() - e,
        error: a.message
      });
    }), m.on("close", (a) => {
      const T = Number.isInteger(a) ? Number(a) : 1, E = T === 0 && !l, x = l ? `
[terminated: timeout]` : "";
      w({
        ok: E,
        command: t.normalized,
        stdout: o,
        stderr: `${s}${x}`.trim(),
        code: l ? 124 : T,
        durationMs: Date.now() - e,
        error: E ? void 0 : l ? "command timeout" : "command failed"
      });
    });
  });
}
function D() {
  d = new S({
    icon: c.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    width: 1200,
    height: 800,
    webPreferences: {
      preload: c.join(y, "preload.mjs"),
      contextIsolation: !0,
      nodeIntegration: !1
    },
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0d0d0f",
      symbolColor: "#56565f",
      height: 32
    }
  }), d.webContents.on("did-finish-load", () => {
    d == null || d.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), _ ? d.loadURL(_) : d.loadFile(c.join(v, "index.html"));
}
u.on("window-all-closed", () => {
  process.platform !== "darwin" && (u.quit(), d = null);
});
u.on("activate", () => {
  S.getAllWindows().length === 0 && D();
});
u.whenReady().then(D);
i.handle("get-env", () => ({
  platform: process.platform,
  version: u.getVersion()
}));
i.handle("ctx-api:get-base-url", () => g);
i.handle("ctx-api:get-state", async () => p("/api/state"));
i.handle("ctx-api:set-task", async (n, e) => {
  await p("/api/pipeline/task", {
    method: "POST",
    body: JSON.stringify({ task: e })
  });
});
i.handle("ctx-api:set-stage", async (n, e) => {
  await p("/api/pipeline/stage", {
    method: "POST",
    body: JSON.stringify({ stage: e })
  });
});
i.handle("ctx-api:search-kb", async (n, e, t = 10, r) => {
  const o = new URLSearchParams({ q: e, limit: String(t) });
  return r && o.set("project", r), p(`/api/kb/search?${o.toString()}`);
});
i.handle("ctx-api:get-kb-stats", async () => p("/api/kb/stats"));
i.handle("ctx-api:get-agent-details", async (n, e) => p("/api/agent/details", {
  method: "POST",
  body: JSON.stringify({ id: e })
}));
i.handle(
  "ctx-terminal:get-allowlist",
  () => j()
);
i.handle("ctx-terminal:run", async (n, e) => V(e));
export {
  J as MAIN_DIST,
  v as RENDERER_DIST,
  _ as VITE_DEV_SERVER_URL
};
