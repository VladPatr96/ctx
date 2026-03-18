import { z } from 'zod';
import { ProviderKeySchema, RuntimeAvailabilityStatusSchema } from './runtime-schemas.js';
import {
  buildProviderResilienceStatus,
  buildStorageResilienceStatus,
} from './runtime-resilience-schemas.js';

const NullableStringSchema = z.string().nullable().default(null);

export const ShellSessionSummarySchema = z.object({
  stage: z.string().default('idle'),
  lead: z.string().default('codex'),
  task: z.string().nullable().default(null),
  updatedAt: NullableStringSchema,
}).strict();

export const ShellProjectSummarySchema = z.object({
  name: z.string().default(''),
  branch: z.string().default(''),
  stackLabel: z.string().default(''),
}).strict();

export const ShellStorageSourceSchema = z.object({
  source: z.string(),
  channel: z.string().optional(),
  backing: z.string().optional(),
  mode: z.string().optional(),
  failover: z.boolean().optional(),
  shadow: z.boolean().optional(),
  path: z.string().optional(),
  migration: z.string().optional(),
}).passthrough();

export const ShellStorageSummarySchema = z.object({
  status: RuntimeAvailabilityStatusSchema.default('offline'),
  mode: z.string().default('unknown'),
  effectiveMode: z.string().default('unknown'),
  policyState: NullableStringSchema,
  failureRatio: z.number().min(0).max(1).nullable().default(null),
  failover: z.boolean().default(false),
  shadow: z.boolean().default(false),
  warningActive: z.boolean().default(false),
  reasons: z.array(z.string()).default([]),
  sourceCount: z.number().int().nonnegative().default(0),
  sources: z.record(ShellStorageSourceSchema).default({}),
  ts: NullableStringSchema,
}).passthrough();

export const ShellProviderCardSchema = z.object({
  provider: ProviderKeySchema,
  status: RuntimeAvailabilityStatusSchema.default('offline'),
  model: z.string().nullable().default(null),
  calls: z.number().int().nonnegative().default(0),
  successes: z.number().int().nonnegative().default(0),
  failures: z.number().int().nonnegative().default(0),
  consecutiveFailures: z.number().int().nonnegative().default(0),
  circuitOpen: z.boolean().default(false),
  successRate: z.number().min(0).max(100).default(0),
  avgLatencyMs: z.number().nonnegative().default(0),
  lastLatencyMs: z.number().nonnegative().default(0),
  lastSuccess: NullableStringSchema,
  lastFailure: NullableStringSchema,
  updatedAt: NullableStringSchema,
  hasTelemetry: z.boolean().default(false),
  reasons: z.array(z.string()).default([]),
}).strict();

export const ShellProvidersSummarySchema = z.object({
  models: z.record(z.string()).default({}),
  cards: z.array(ShellProviderCardSchema).default([]),
}).strict();

export const ShellSummarySchema = z.object({
  session: ShellSessionSummarySchema,
  project: ShellProjectSummarySchema,
  storage: ShellStorageSummarySchema,
  providers: ShellProvidersSummarySchema,
}).strict();

export function parseShellSummary(input) {
  return ShellSummarySchema.parse(input);
}

export function createShellSummary(snapshot = {}) {
  const pipeline = asRecord(snapshot.pipeline);
  const project = asRecord(snapshot.project);
  const storageHealth = asRecord(snapshot.storageHealth);
  const providerHealth = asRecord(snapshot.providerHealth);
  const models = normalizeModels(pipeline.models);
  const sourceCount = Object.keys(asRecord(storageHealth.sources)).length;
  const storageStatus = buildStorageResilienceStatus(storageHealth, { sourceCount });
  const providerIds = [...new Set([
    ...Object.keys(models),
    ...Object.keys(providerHealth).filter((provider) => normalizeProviderId(provider)),
  ])].sort();

  return parseShellSummary({
    session: {
      stage: normalizeString(pipeline.stage, 'idle'),
      lead: normalizeString(pipeline.lead, 'codex'),
      task: normalizeNullableString(pipeline.task),
      updatedAt: normalizeNullableString(pipeline.updatedAt),
    },
    project: {
      name: normalizeString(project.name ?? project.project, ''),
      branch: resolveProjectBranch(project),
      stackLabel: formatProjectStack(project.stack),
    },
    storage: {
      status: storageStatus.status,
      mode: normalizeString(storageHealth.mode, 'unknown'),
      effectiveMode: normalizeString(storageHealth.effectiveMode, normalizeString(storageHealth.mode, 'unknown')),
      policyState: normalizeNullableString(storageHealth.policyState ?? storageHealth.policy?.effectiveState),
      failureRatio: normalizeNullableNumber(storageHealth.failureRatio ?? storageHealth.totals?.failureRatio),
      failover: normalizeBoolean(storageHealth.failover),
      shadow: normalizeBoolean(storageHealth.shadow),
      warningActive: normalizeBoolean(storageHealth.warningActive),
      reasons: storageStatus.reasons,
      sourceCount,
      sources: normalizeSources(storageHealth.sources),
      ts: normalizeNullableString(storageHealth.ts),
    },
    providers: {
      models,
      cards: providerIds
        .map((provider) => buildProviderCard(provider, models[provider] ?? null, providerHealth[provider]))
        .filter(Boolean),
    },
  });
}

function buildProviderCard(provider, model, rawHealth) {
  const normalizedProvider = normalizeProviderId(provider);
  if (!normalizedProvider) {
    return null;
  }

  const health = asRecord(rawHealth);
  const calls = normalizeCount(health.calls);
  const successes = normalizeCount(health.successes);
  const failures = normalizeCount(health.totalFailures ?? health.failures);
  const successRate = clamp(
    normalizeNumber(
      health.successRate,
      calls > 0 ? (successes / calls) * 100 : 0
    ),
    0,
    100
  );
  const avgLatencyMs = clamp(normalizeNumber(health.avgLatencyMs, normalizeNumber(health.lastLatencyMs, 0)), 0);
  const lastLatencyMs = clamp(normalizeNumber(health.lastLatencyMs, avgLatencyMs), 0);
  const consecutiveFailures = normalizeCount(health.failures);
  const resilience = buildProviderResilienceStatus(normalizedProvider, {
    model,
    hasTelemetry: calls > 0 || successes > 0 || failures > 0 || avgLatencyMs > 0 || lastLatencyMs > 0,
    successRate,
    failures: consecutiveFailures,
  });

  return ShellProviderCardSchema.parse({
    provider: normalizedProvider,
    status: resilience.status,
    model: normalizeNullableString(model),
    calls,
    successes,
    failures,
    consecutiveFailures: resilience.consecutiveFailures,
    circuitOpen: resilience.circuitOpen,
    successRate,
    avgLatencyMs,
    lastLatencyMs,
    lastSuccess: normalizeNullableString(health.lastSuccess),
    lastFailure: normalizeNullableString(health.lastFailure),
    updatedAt: normalizeNullableString(health.updatedAt),
    hasTelemetry: calls > 0 || successes > 0 || failures > 0 || avgLatencyMs > 0 || lastLatencyMs > 0,
    reasons: resilience.reasons,
  });
}

function normalizeModels(value) {
  const record = asRecord(value);
  const models = {};
  for (const [provider, model] of Object.entries(record)) {
    const normalizedProvider = normalizeProviderId(provider);
    const normalizedModel = normalizeString(model, '');
    if (normalizedProvider && normalizedModel) {
      models[normalizedProvider] = normalizedModel;
    }
  }
  return models;
}

function normalizeSources(value) {
  const record = asRecord(value);
  const sources = {};
  for (const [name, source] of Object.entries(record)) {
    if (!name || !isRecord(source)) continue;
    sources[name] = ShellStorageSourceSchema.parse(source);
  }
  return sources;
}

function resolveProjectBranch(project) {
  const git = asRecord(project.git);
  return normalizeString(
    git.branch
      ?? git.currentBranch
      ?? project.branch
      ?? project.currentBranch,
    ''
  );
}

function formatProjectStack(stack) {
  if (typeof stack === 'string') {
    return stack.trim();
  }

  if (Array.isArray(stack)) {
    return stack.map((part) => normalizeString(part, '')).filter(Boolean).join(', ');
  }

  if (!isRecord(stack)) {
    return '';
  }

  if (typeof stack.primary === 'string' && stack.primary.trim()) {
    return stack.primary.trim();
  }

  return Object.keys(stack).slice(0, 3).join(', ');
}

function normalizeProviderId(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized && ProviderKeySchema.safeParse(normalized).success ? normalized : null;
}

function normalizeCount(value) {
  return Math.max(0, Math.floor(normalizeNumber(value, 0)));
}

function normalizeNumber(value, fallback = 0) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function normalizeNullableNumber(value) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : null;
}

function normalizeBoolean(value) {
  return value === true;
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function normalizeNullableString(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function clamp(value, min, max = Number.POSITIVE_INFINITY) {
  return Math.min(max, Math.max(min, value));
}

function asRecord(value) {
  return isRecord(value) ? value : {};
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Shell Connection (merged from shell-connection.js)
// ---------------------------------------------------------------------------

export const SHELL_CONNECTION_BUDGET = Object.freeze({
  baseReconnectDelayMs: 1000,
  maxReconnectDelayMs: 30000,
  staleAfterMs: 15000,
  recoveryPollMs: 5000,
  minRecoveryIntervalMs: 3000,
});

export function getShellReconnectDelay(attempt, budget = SHELL_CONNECTION_BUDGET) {
  const normalizedAttempt = normalizeConnectionAttempt(attempt);
  return Math.min(
    budget.baseReconnectDelayMs * Math.pow(2, normalizedAttempt),
    budget.maxReconnectDelayMs
  );
}

export function isShellSnapshotStale({ lastSnapshotAt, now = Date.now(), budget = SHELL_CONNECTION_BUDGET } = {}) {
  const snapshotAt = normalizeConnectionTimestamp(lastSnapshotAt);
  if (!snapshotAt) return false;
  return now - snapshotAt >= budget.staleAfterMs;
}

export function shouldRecoverShellSnapshot({
  lastSnapshotAt,
  lastRefreshAt,
  now = Date.now(),
  budget = SHELL_CONNECTION_BUDGET,
} = {}) {
  if (!isShellSnapshotStale({ lastSnapshotAt, now, budget })) {
    return false;
  }

  const refreshAt = normalizeConnectionTimestamp(lastRefreshAt);
  if (!refreshAt) {
    return true;
  }

  return now - refreshAt >= budget.minRecoveryIntervalMs;
}

function normalizeConnectionAttempt(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.floor(parsed);
}

function normalizeConnectionTimestamp(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return parsed;
}

// ---------------------------------------------------------------------------
// Shell Navigation (merged from shell-navigation.js)
// ---------------------------------------------------------------------------

/** @typedef {'command' | 'dashboard' | 'knowledge' | 'agents' | 'routing' | 'devpipeline' | 'orchestrator' | 'debates' | 'settings' | 'terminal'} ShellTabId */
/** @typedef {'dark' | 'light'} ShellTheme */
/** @typedef {{ id: ShellTabId, label: string, icon: string, focusTargetId?: string }} ShellTab */
/** @typedef {{ tab: ShellTabId, focusTargetId?: string }} ShellShortcut */
/** @typedef {{ getItem?: (key: string) => string | null, setItem?: (key: string, value: string) => void }} StorageLike */

export const DEFAULT_SHELL_TAB = 'command';
export const DEFAULT_SHELL_THEME = 'dark';
export const SHELL_ACTIVE_TAB_STORAGE_KEY = 'ctx-active-tab';
export const SHELL_THEME_STORAGE_KEY = 'ctx-theme';

/** @type {ReadonlyArray<ShellTab>} */
export const SHELL_TABS = Object.freeze([
  { id: 'command', label: 'Command Center', icon: 'command', focusTargetId: 'cmd-input' },
  { id: 'dashboard', label: 'Pipeline', icon: 'layout-dashboard', focusTargetId: 'task-input' },
  { id: 'knowledge', label: 'Knowledge', icon: 'book-open', focusTargetId: 'kb-search-input' },
  { id: 'agents', label: 'Agents', icon: 'users' },
  { id: 'routing', label: 'Routing', icon: 'git-branch' },
  { id: 'devpipeline', label: 'Dev Pipeline', icon: 'workflow' },
  { id: 'orchestrator', label: 'Orchestrator', icon: 'bot' },
  { id: 'debates', label: 'Debates', icon: 'message-square-more' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
  { id: 'terminal', label: 'Terminal', icon: 'terminal' },
]);

/** @type {Readonly<Record<string, ShellShortcut>>} */
export const SHELL_SHORTCUTS = Object.freeze({
  c: Object.freeze({ tab: 'command', focusTargetId: 'cmd-input' }),
  t: Object.freeze({ tab: 'dashboard', focusTargetId: 'task-input' }),
  k: Object.freeze({ tab: 'knowledge', focusTargetId: 'kb-search-input' }),
});

const SHELL_TAB_SET = new Set(SHELL_TABS.map((tab) => tab.id));
const SHELL_THEME_SET = new Set(['dark', 'light']);

export function isShellTab(value) {
  return typeof value === 'string' && SHELL_TAB_SET.has(value);
}

export function normalizeShellTab(value, fallback = DEFAULT_SHELL_TAB) {
  return isShellTab(value) ? value : fallback;
}

export function getShellShortcut(key) {
  if (typeof key !== 'string') return null;
  return SHELL_SHORTCUTS[key.trim().toLowerCase()] || null;
}

export function normalizeShellTheme(value, fallback = DEFAULT_SHELL_THEME) {
  if (typeof value !== 'string') {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  return SHELL_THEME_SET.has(normalized) ? normalized : fallback;
}

export function readStoredShellTab(storage) {
  return normalizeShellTab(readNavigationStorageValue(storage, SHELL_ACTIVE_TAB_STORAGE_KEY));
}

export function readStoredShellTheme(storage) {
  return normalizeShellTheme(readNavigationStorageValue(storage, SHELL_THEME_STORAGE_KEY));
}

export function resolveInitialShellTab({ search = '', storage } = {}) {
  const params = new URLSearchParams(normalizeNavigationSearch(search));
  const queryTab = params.get('tab');
  if (isShellTab(queryTab)) {
    return queryTab;
  }
  return readStoredShellTab(storage);
}

export function buildShellSearch(search = '', activeTab = DEFAULT_SHELL_TAB) {
  const params = new URLSearchParams(normalizeNavigationSearch(search));
  params.set('tab', normalizeShellTab(activeTab));
  const next = params.toString();
  return next ? `?${next}` : '';
}

export function persistShellTab(storage, activeTab) {
  writeNavigationStorageValue(storage, SHELL_ACTIVE_TAB_STORAGE_KEY, normalizeShellTab(activeTab));
}

export function persistShellTheme(storage, theme) {
  writeNavigationStorageValue(storage, SHELL_THEME_STORAGE_KEY, normalizeShellTheme(theme));
}

function readNavigationStorageValue(storage, key) {
  try {
    return storage?.getItem?.(key) ?? null;
  } catch {
    return null;
  }
}

function writeNavigationStorageValue(storage, key, value) {
  try {
    storage?.setItem?.(key, value);
  } catch {
    // Ignore storage failures; shell state can still work in-memory.
  }
}

function normalizeNavigationSearch(search) {
  if (typeof search !== 'string') return '';
  return search.startsWith('?') ? search.slice(1) : search;
}
