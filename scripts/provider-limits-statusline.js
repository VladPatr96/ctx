#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

const PROVIDERS = ['claude', 'gemini', 'codex', 'opencode'];
const CLAUDE_USAGE_URL = 'https://api.anthropic.com/api/oauth/usage';
const CLAUDE_CACHE_TTL_MS = 2 * 60 * 1000;
const OPENCODE_PROVIDER_TTL_MS = 10 * 60 * 1000;
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_RESET_MS = 5 * 60 * 1000;

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFiniteNumber(value, fallback = null) {
  const parsed = Number.parseFloat(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampPct(value) {
  const n = toFiniteNumber(value, 0);
  if (n < 0) return 0;
  if (n > 100) return 100;
  return n;
}

function readJson(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(path, data) {
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify(data, null, 2));
  } catch {
    // ignore cache write failures
  }
}

function parseEpochMs(value) {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const asNum = Number.parseInt(trimmed, 10);
      return Number.isFinite(asNum) && asNum > 0 ? asNum : null;
    }
    const asDate = Date.parse(trimmed);
    return Number.isFinite(asDate) ? asDate : null;
  }
  return null;
}

function formatDuration(ms) {
  if (!Number.isFinite(ms)) return '--';
  if (ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `${days}d${hours}h`;
  if (hours > 0) return `${hours}h${minutes}m`;
  return `${minutes}m`;
}

function formatCountdown(epochMs, nowMs) {
  if (!Number.isFinite(epochMs)) return '--';
  return formatDuration(epochMs - nowMs);
}

function toAnsi(noColor) {
  if (noColor) {
    return {
      reset: '',
      dim: '',
      green: '',
      yellow: '',
      red: '',
      cyan: '',
      blue: ''
    };
  }
  return {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
    cyan: '\x1b[36m',
    blue: '\x1b[34m'
  };
}

function stripAnsi(value) {
  return String(value).replace(/\x1b\[[0-9;]*m/g, '');
}

function shortModelId(id) {
  const raw = String(id || '').trim();
  if (!raw) return '--';
  const tail = raw.includes('/') ? raw.split('/').slice(-1)[0] : raw;
  return tail.length > 24 ? `${tail.slice(0, 24)}~` : tail;
}

function formatTokenLimit(value) {
  const n = toInt(value, 0);
  if (n <= 0) return '--';
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return `${n}`;
}

function percentColor(remainingPct, ansi) {
  if (remainingPct > 50) return ansi.green;
  if (remainingPct >= 20) return ansi.yellow;
  return ansi.red;
}

function collectDateCandidates(input, out = []) {
  if (!input) return out;
  if (typeof input === 'string' || typeof input === 'number') {
    const ms = parseEpochMs(input);
    if (ms) out.push(ms);
    return out;
  }
  if (Array.isArray(input)) {
    for (const item of input) collectDateCandidates(item, out);
    return out;
  }
  if (typeof input === 'object') {
    for (const value of Object.values(input)) collectDateCandidates(value, out);
    return out;
  }
  return out;
}

function detectCircuitOpen(entry, nowMs) {
  if (!entry || toInt(entry.failures, 0) < CIRCUIT_THRESHOLD) return false;
  const lastFailure = Date.parse(String(entry.lastFailure || ''));
  if (!Number.isFinite(lastFailure)) return false;
  return (nowMs - lastFailure) <= CIRCUIT_RESET_MS;
}

function getProviderCalls(entry) {
  return toInt(entry?.calls, 0);
}

function getOpenCodeConfigModel(cwd) {
  const configPath = join(cwd, 'opencode.json');
  const config = readJson(configPath);
  if (!config || typeof config !== 'object') return null;
  const model = config.model;
  return typeof model === 'string' && model.trim() ? model.trim() : null;
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function getClaudeToken() {
  const credsPath = join(homedir(), '.claude', '.credentials.json');
  const creds = readJson(credsPath);
  const token = creds?.claudeAiOauth?.accessToken;
  return typeof token === 'string' && token.trim() ? token.trim() : null;
}

async function getClaudeUsage(cacheFile) {
  const cached = readJson(cacheFile);
  const nowMs = Date.now();
  if (cached && Number.isFinite(cached.cachedAtMs) && nowMs - cached.cachedAtMs <= CLAUDE_CACHE_TTL_MS) {
    return cached.payload || null;
  }

  const token = getClaudeToken();
  if (!token) return cached?.payload || null;

  const payload = await fetchJsonWithTimeout(
    CLAUDE_USAGE_URL,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'anthropic-beta': 'oauth-2025-04-20',
        Accept: 'application/json'
      }
    },
    5000
  );

  if (payload) {
    writeJson(cacheFile, { cachedAtMs: nowMs, payload });
    return payload;
  }
  return cached?.payload || null;
}

function normalizeClaudeUsage(raw) {
  if (!raw?.five_hour || !raw?.seven_day) return null;
  const fiveUsed = clampPct(raw.five_hour.utilization);
  const weekUsed = clampPct(raw.seven_day.utilization);
  const fiveResetMs = parseEpochMs(raw.five_hour.resets_at);
  const weekResetMs = parseEpochMs(raw.seven_day.resets_at);
  return {
    fiveRemainingPct: Math.round(100 - fiveUsed),
    weekRemainingPct: Math.round(100 - weekUsed),
    fiveResetMs,
    weekResetMs
  };
}

function getGeminiStatus(nowMs) {
  const credsPath = join(homedir(), '.gemini', 'oauth_creds.json');
  const creds = readJson(credsPath);
  const expiryMs = parseEpochMs(creds?.expiry_date);
  const hasCreds = Boolean(creds);
  return {
    hasCreds,
    expiryMs,
    authLeft: expiryMs ? formatCountdown(expiryMs, nowMs) : '--'
  };
}

function getCodexStatus(nowMs) {
  const authPath = join(homedir(), '.codex', 'auth.json');
  const auth = readJson(authPath);
  const lastRefreshMs = parseEpochMs(auth?.last_refresh);
  const lastRefreshAgo = lastRefreshMs ? formatDuration(nowMs - lastRefreshMs) : '--';
  return {
    hasAuth: Boolean(auth),
    lastRefreshMs,
    lastRefreshAgo
  };
}

function getOpenCodeLocalStatus(nowMs) {
  const accountsPath = join(homedir(), '.config', 'opencode', 'antigravity-accounts.json');
  const data = readJson(accountsPath);
  const accounts = Array.isArray(data?.accounts) ? data.accounts : [];
  const activeIndex = toInt(data?.activeIndex, 0);
  const active = accounts[activeIndex] || accounts[0] || null;

  const resetCandidates = collectDateCandidates(active?.rateLimitResetTimes);
  const futureResets = resetCandidates.filter(ms => ms > nowMs).sort((a, b) => a - b);
  const nextResetMs = futureResets.length > 0 ? futureResets[0] : null;
  const lastUsedMs = parseEpochMs(active?.lastUsed);

  return {
    hasAccount: Boolean(active),
    nextResetMs,
    resetLeft: nextResetMs ? formatCountdown(nextResetMs, nowMs) : '--',
    lastUsedAgo: lastUsedMs ? formatDuration(nowMs - lastUsedMs) : '--',
    modelLimits: null
  };
}

function buildOpenCodeModelSummary(providerResponse, preferredModel) {
  if (!providerResponse || typeof providerResponse !== 'object') return null;
  const connected = Array.isArray(providerResponse.connected) ? providerResponse.connected.map(String) : [];
  const all = Array.isArray(providerResponse.all) ? providerResponse.all : [];
  const connectedSet = new Set(connected);
  const connectedProviders = all.filter(p => p && connectedSet.has(String(p.id)));

  let totalModels = 0;
  let maxContext = 0;
  let maxOutput = 0;
  let selected = null;

  const preferred = String(preferredModel || '').trim().toLowerCase();

  for (const provider of connectedProviders) {
    const providerId = String(provider.id || '');
    const modelsMap = provider?.models && typeof provider.models === 'object' ? provider.models : {};
    const entries = Object.entries(modelsMap);
    totalModels += entries.length;

    for (const [modelKey, modelValue] of entries) {
      const model = modelValue || {};
      const modelId = String(model.id || modelKey || '');
      const fullKey = modelKey || modelId ? `${providerId}/${modelId}` : '';
      const limit = model.limit || {};

      const context = toInt(limit.context, 0);
      const output = toInt(limit.output, 0);
      if (context > maxContext) maxContext = context;
      if (output > maxOutput) maxOutput = output;

      const candidates = new Set([
        String(modelKey || '').toLowerCase(),
        modelId.toLowerCase(),
        fullKey.toLowerCase()
      ]);
      if (
        preferred &&
        !selected &&
        (candidates.has(preferred) || preferred.endsWith(`/${modelId.toLowerCase()}`))
      ) {
        selected = {
          providerId,
          modelId: modelKey || modelId,
          context,
          output
        };
      }
    }
  }

  if (!selected && connectedProviders.length > 0 && providerResponse.default && typeof providerResponse.default === 'object') {
    for (const [providerId, modelIdRaw] of Object.entries(providerResponse.default)) {
      if (!connectedSet.has(String(providerId))) continue;
      const provider = connectedProviders.find(p => String(p.id) === String(providerId));
      if (!provider?.models || typeof provider.models !== 'object') continue;
      const modelId = String(modelIdRaw || '');
      const keyMatch =
        provider.models[modelId] ||
        provider.models[`${providerId}/${modelId}`] ||
        provider.models[String(modelId).toLowerCase()];
      if (!keyMatch) continue;
      const limit = keyMatch.limit || {};
      selected = {
        providerId: String(providerId),
        modelId: modelId,
        context: toInt(limit.context, 0),
        output: toInt(limit.output, 0)
      };
      break;
    }
  }

  return {
    connectedProviders: connected.length,
    totalModels,
    maxContext,
    maxOutput,
    selected
  };
}

function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getCliEnv() {
  const env = { ...process.env };
  const isWin = process.platform === 'win32';
  const home = homedir();
  const additions = isWin
    ? [join(home, 'AppData', 'Roaming', 'npm')]
    : [join(home, '.local', 'bin')];

  const pathKey = Object.keys(env).find(k => k.toUpperCase() === 'PATH') || 'PATH';
  const sep = isWin ? ';' : ':';
  const current = String(env[pathKey] || '').split(sep).filter(Boolean);
  for (const item of additions) {
    if (item && !current.includes(item)) current.unshift(item);
  }
  env[pathKey] = current.join(sep);
  return env;
}

async function startOpenCodeServer(timeoutMs = 9000) {
  const port = 43000 + Math.floor(Math.random() * 2000);
  const baseArgs = ['serve', '--hostname=127.0.0.1', `--port=${port}`];
  const env = getCliEnv();
  const child = process.platform === 'win32'
    ? spawn('cmd', ['/c', 'opencode', ...baseArgs], {
      shell: false,
      stdio: 'ignore',
      env
    })
    : spawn('opencode', baseArgs, {
      shell: false,
      stdio: 'ignore',
      env
    });

  // Give child a brief chance to fail fast (bad command/path).
  const fastFail = await new Promise((resolve) => {
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      resolve(ok);
    };
    child.on('error', () => finish(false));
    child.on('exit', (code) => finish(code === null || code === 0));
    setTimeout(() => finish(true), Math.min(700, timeoutMs));
  });

  if (!fastFail) {
    stopOpenCodeServer(child);
    return null;
  }

  return {
    url: `http://127.0.0.1:${port}`,
    stop() {
      stopOpenCodeServer(child);
    }
  };
}

function stopOpenCodeServer(child) {
  try {
    if (!child) return;
    if (process.platform === 'win32' && child.pid) {
      // Ensure wrapper + spawned server are terminated on Windows.
      spawn('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
        shell: false,
        stdio: 'ignore'
      });
      return;
    }
    child.kill();
  } catch {
    // ignore shutdown errors
  }
}

async function fetchOpenCodeProviderData(cwd) {
  const server = await startOpenCodeServer();
  if (!server) return null;
  try {
    const url = `${server.url.replace(/\/+$/, '')}/provider?directory=${encodeURIComponent(cwd)}`;
    const deadline = Date.now() + 8000;
    while (Date.now() < deadline) {
      // eslint-disable-next-line no-await-in-loop
      const payload = await fetchJsonWithTimeout(url, {}, 1200);
      if (payload && typeof payload === 'object') return payload;
      // eslint-disable-next-line no-await-in-loop
      await wait(350);
    }
    return null;
  } finally {
    server.stop();
  }
}

async function getOpenCodeModelLimits(cacheFile, cwd) {
  const nowMs = Date.now();
  const cached = readJson(cacheFile);
  if (cached && Number.isFinite(cached.cachedAtMs) && nowMs - cached.cachedAtMs <= OPENCODE_PROVIDER_TTL_MS) {
    return cached.payload || null;
  }

  const providerDataRaw = await fetchOpenCodeProviderData(cwd);
  const providerData = providerDataRaw?.data && typeof providerDataRaw.data === 'object'
    ? providerDataRaw.data
    : providerDataRaw;
  const preferredModel = getOpenCodeConfigModel(cwd);
  const payload = buildOpenCodeModelSummary(providerData, preferredModel);
  if (payload) {
    writeJson(cacheFile, { cachedAtMs: nowMs, payload });
    return payload;
  }
  return cached?.payload || null;
}

async function collectSnapshot({ nowMs = Date.now(), cwd = process.cwd() } = {}) {
  const cacheFile = join(cwd, '.data', '.cache', 'claude-usage.json');
  const opencodeCacheFile = join(cwd, '.data', '.cache', 'opencode-providers.json');
  const providerHealthPath = join(cwd, '.data', 'provider-health.json');
  const providerHealth = readJson(providerHealthPath) || {};

  const [claudeRaw, opencodeModelLimits] = await Promise.all([
    getClaudeUsage(cacheFile),
    getOpenCodeModelLimits(opencodeCacheFile, cwd)
  ]);

  return {
    nowMs,
    providerHealth,
    claude: normalizeClaudeUsage(claudeRaw),
    gemini: getGeminiStatus(nowMs),
    codex: getCodexStatus(nowMs),
    opencode: {
      ...getOpenCodeLocalStatus(nowMs),
      modelLimits: opencodeModelLimits
    }
  };
}

function renderClaudeSegment(snapshot, ansi) {
  const health = snapshot.providerHealth.claude || null;
  const calls = getProviderCalls(health);
  const circuit = detectCircuitOpen(health, snapshot.nowMs) ? `${ansi.red} !circuit${ansi.reset}` : '';
  if (!snapshot.claude) {
    return `${ansi.cyan}CLAUDE${ansi.reset} lim:-- use:${calls}${circuit}`;
  }
  const five = snapshot.claude.fiveRemainingPct;
  const week = snapshot.claude.weekRemainingPct;
  const fiveColor = percentColor(five, ansi);
  const weekColor = percentColor(week, ansi);
  const fiveLeft = formatCountdown(snapshot.claude.fiveResetMs, snapshot.nowMs);
  const weekLeft = formatCountdown(snapshot.claude.weekResetMs, snapshot.nowMs);
  return `${ansi.cyan}CLAUDE${ansi.reset} 5h:${fiveColor}${five}%${ansi.reset}(${fiveLeft}) 7d:${weekColor}${week}%${ansi.reset}(${weekLeft}) use:${calls}${circuit}`;
}

function renderGeminiSegment(snapshot, ansi) {
  const health = snapshot.providerHealth.gemini || null;
  const calls = getProviderCalls(health);
  const authText = snapshot.gemini.expiryMs ? snapshot.gemini.authLeft : '--';
  return `${ansi.cyan}GEMINI${ansi.reset} lim:-- auth:${authText} use:${calls}`;
}

function renderCodexSegment(snapshot, ansi) {
  const health = snapshot.providerHealth.codex || null;
  const calls = getProviderCalls(health);
  const authText = snapshot.codex.hasAuth ? `ok(${snapshot.codex.lastRefreshAgo})` : '--';
  return `${ansi.cyan}CODEX${ansi.reset} lim:-- auth:${authText} use:${calls}`;
}

function renderOpenCodeSegment(snapshot, ansi) {
  const health = snapshot.providerHealth.opencode || null;
  const calls = getProviderCalls(health);
  const limits = snapshot.opencode?.modelLimits || null;

  let limitText = snapshot.opencode.nextResetMs ? `reset:${snapshot.opencode.resetLeft}` : 'lim:--';
  if (limits) {
    if (limits.selected) {
      const modelName = shortModelId(limits.selected.modelId);
      const ctx = formatTokenLimit(limits.selected.context);
      const out = formatTokenLimit(limits.selected.output);
      limitText = `mdl:${modelName} ${ctx}/${out}`;
    } else if (limits.maxContext > 0 || limits.maxOutput > 0) {
      const ctx = formatTokenLimit(limits.maxContext);
      const out = formatTokenLimit(limits.maxOutput);
      limitText = `mdl:max ${ctx}/${out}`;
    }
  }

  const providerText = limits ? `keys:${limits.connectedProviders} mdl:${limits.totalModels}` : 'keys:--';
  const authText = snapshot.opencode.hasAccount ? `acct:ok(${snapshot.opencode.lastUsedAgo})` : 'acct:--';
  return `${ansi.cyan}OPENCODE${ansi.reset} ${limitText} ${providerText} ${authText} use:${calls}`;
}

export function buildStatusLine(snapshot, { noColor = false } = {}) {
  const ansi = toAnsi(noColor);
  const now = new Date(snapshot.nowMs);
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  const header = `${ansi.blue}${hh}:${mm}:${ss}${ansi.reset}`;
  const parts = [
    renderClaudeSegment(snapshot, ansi),
    renderGeminiSegment(snapshot, ansi),
    renderCodexSegment(snapshot, ansi),
    renderOpenCodeSegment(snapshot, ansi)
  ];
  return `${header} ${ansi.dim}|${ansi.reset} ${parts.join(` ${ansi.dim}|${ansi.reset} `)}`;
}

function parseArgs(argv) {
  const opts = {
    watch: false,
    intervalSec: 15,
    noColor: !process.stdout.isTTY,
    json: false
  };
  for (const arg of argv) {
    if (arg === '--watch') opts.watch = true;
    else if (arg === '--no-color') opts.noColor = true;
    else if (arg === '--json') opts.json = true;
    else if (arg.startsWith('--interval=')) {
      opts.intervalSec = Math.max(3, toInt(arg.slice('--interval='.length), 15));
    }
  }
  return opts;
}

function writeSingleLine(line, state) {
  if (!process.stdout.isTTY) {
    process.stdout.write(`${line}\n`);
    return;
  }
  const visible = stripAnsi(line).length;
  const pad = Math.max(0, state.lastVisible - visible);
  process.stdout.write(`\r${line}${' '.repeat(pad)}`);
  state.lastVisible = visible;
}

async function renderOnce(opts, state) {
  const snapshot = await collectSnapshot();
  if (opts.json) {
    process.stdout.write(`${JSON.stringify(snapshot)}\n`);
    return;
  }
  const line = buildStatusLine(snapshot, { noColor: opts.noColor });
  if (opts.watch) {
    writeSingleLine(line, state);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

async function run() {
  const opts = parseArgs(process.argv.slice(2));
  const state = { lastVisible: 0 };

  if (!opts.watch) {
    await renderOnce(opts, state);
    return;
  }

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (process.stdout.isTTY) process.stdout.write('\n');
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);

  while (!stopped) {
    // eslint-disable-next-line no-await-in-loop
    await renderOnce(opts, state);
    // eslint-disable-next-line no-await-in-loop
    await new Promise(resolve => setTimeout(resolve, opts.intervalSec * 1000));
  }
}

export {
  collectDateCandidates,
  formatDuration,
  formatCountdown,
  parseEpochMs,
  parseArgs,
  collectSnapshot,
  PROVIDERS
};

function isMainModule() {
  if (!process.argv[1]) return false;
  return import.meta.url === pathToFileURL(process.argv[1]).href;
}

if (isMainModule()) {
  run().catch((err) => {
    process.stderr.write(`provider-limits-statusline failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
