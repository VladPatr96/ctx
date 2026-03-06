import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { spawn } from "node:child_process";
const TERMINAL_FORBIDDEN_RE = /[&;<>`]/;
const TERMINAL_ALLOWLIST = Object.freeze({
  node: [["-v"], ["--version"]],
  npm: [["test"], ["run", "test"], ["run", "build"]],
  git: [["status"], ["status", "--short"], ["branch", "--show-current"]],
  powershell: [["-NoProfile", "-Command", '"Get-ChildItem .sessions/*.md | Sort-Object LastWriteTime -Descending | Select-Object -First 1 | Get-Content"']]
});
function normalizeBin(bin) {
  const normalized = String(bin || "").trim().toLowerCase();
  if (normalized === "node.exe") return "node";
  if (normalized === "npm.cmd" || normalized === "npm.exe") return "npm";
  if (normalized === "git.exe") return "git";
  if (normalized === "powershell.exe") return "powershell";
  return normalized;
}
function listAllowlistedCommands() {
  return Object.entries(TERMINAL_ALLOWLIST).flatMap(([bin, rules]) => rules.map((args) => `${bin} ${args.join(" ")}`.trim()));
}
function parseAllowlistedCommand(commandLine, platform = process.platform) {
  var _a;
  const text = String(commandLine || "").trim();
  if (!text) throw new Error("command is empty");
  if (text.length > 256) throw new Error("command is too long");
  if (TERMINAL_FORBIDDEN_RE.test(text) || text.includes("\n") || text.includes("\r")) {
    throw new Error("command contains forbidden characters");
  }
  const tokens = ((_a = text.match(/(?:[^\s"]+|"[^"]*")+/g)) == null ? void 0 : _a.filter(Boolean)) || [];
  if (tokens.length === 0) throw new Error("command is empty");
  const bin = normalizeBin(tokens[0]);
  const args = tokens.slice(1);
  const allowed = TERMINAL_ALLOWLIST[bin];
  if (!allowed) throw new Error(`command is not allowlisted: ${bin}`);
  const matches = allowed.some((rule) => rule.length === args.length && rule.every((part, index) => part === args[index]));
  if (!matches) throw new Error(`arguments are not allowlisted for ${bin}`);
  const execBin = platform === "win32" && bin === "npm" ? "npm.cmd" : bin;
  return { bin: execBin, args, normalized: `${bin} ${args.join(" ")}`.trim() };
}
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
process.env.CTX_DASHBOARD_URL || "http://127.0.0.1:7331";
const DASHBOARD_TOKEN_FILE = process.env.CTX_DASHBOARD_TOKEN_FILE || path.join(process.cwd(), ".data", ".dashboard-token");
const TERMINAL_TIMEOUT_MS = 6e4;
const TERMINAL_MAX_OUTPUT = 64 * 1024;
function readDashboardToken() {
  if (process.env.CTX_DASHBOARD_TOKEN) return process.env.CTX_DASHBOARD_TOKEN;
  try {
    if (!existsSync(DASHBOARD_TOKEN_FILE)) return "";
    return readFileSync(DASHBOARD_TOKEN_FILE, "utf8").trim();
  } catch {
    return "";
  }
}
function pushChunk(current, chunk) {
  if (!chunk) return current;
  const joined = current + chunk;
  if (joined.length <= TERMINAL_MAX_OUTPUT) return joined;
  return joined.slice(joined.length - TERMINAL_MAX_OUTPUT);
}
function runAllowlistedCommand(commandLine) {
  const startedAt = Date.now();
  let parsed;
  try {
    parsed = parseAllowlistedCommand(commandLine, process.platform);
  } catch (err) {
    return Promise.resolve({
      ok: false,
      command: commandLine.trim(),
      stdout: "",
      stderr: "",
      code: -1,
      durationMs: Date.now() - startedAt,
      error: err instanceof Error ? err.message : String(err)
    });
  }
  return new Promise((resolve) => {
    let stdout = "";
    let stderr = "";
    let finished = false;
    let timedOut = false;
    const child = spawn(parsed.bin, parsed.args, {
      cwd: process.cwd(),
      shell: false,
      windowsHide: true
    });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, TERMINAL_TIMEOUT_MS);
    const done = (result) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      resolve(result);
    };
    child.stdout.on("data", (chunk) => {
      stdout = pushChunk(stdout, chunk.toString());
    });
    child.stderr.on("data", (chunk) => {
      stderr = pushChunk(stderr, chunk.toString());
    });
    child.on("error", (err) => {
      done({
        ok: false,
        command: parsed.normalized,
        stdout,
        stderr,
        code: -1,
        durationMs: Date.now() - startedAt,
        error: err.message
      });
    });
    child.on("close", (code) => {
      const exitCode = Number.isInteger(code) ? Number(code) : 1;
      const ok = exitCode === 0 && !timedOut;
      const timeoutText = timedOut ? "\n[terminated: timeout]" : "";
      done({
        ok,
        command: parsed.normalized,
        stdout,
        stderr: `${stderr}${timeoutText}`.trim(),
        code: timedOut ? 124 : exitCode,
        durationMs: Date.now() - startedAt,
        error: ok ? void 0 : timedOut ? "command timeout" : "command failed"
      });
    });
  });
}
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    },
    titleBarStyle: "hidden",
    titleBarOverlay: {
      color: "#0d0d0f",
      symbolColor: "#56565f",
      height: 32
    }
  });
  if (VITE_DEV_SERVER_URL) {
    win.webContents.openDevTools();
  }
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    const token = readDashboardToken();
    const sep = VITE_DEV_SERVER_URL.includes("?") ? "&" : "?";
    const url = token ? `${VITE_DEV_SERVER_URL}${sep}token=${encodeURIComponent(token)}` : VITE_DEV_SERVER_URL;
    win.loadURL(url);
  } else {
    const token = readDashboardToken();
    if (token) {
      win.loadURL(`file://${path.join(RENDERER_DIST, "index.html")}?token=${encodeURIComponent(token)}`);
    } else {
      win.loadFile(path.join(RENDERER_DIST, "index.html"));
    }
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(createWindow);
ipcMain.handle("get-env", () => ({
  platform: process.platform,
  version: app.getVersion()
}));
ipcMain.handle(
  "ctx-terminal:get-allowlist",
  () => listAllowlistedCommands()
);
ipcMain.handle("ctx-terminal:run", async (_event, command) => runAllowlistedCommand(command));
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
