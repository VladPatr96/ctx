/**
 * Smart Task Router — выбирает лучшего провайдера на основе типа задачи.
 *
 * Функции:
 * - route(task) — один лучший провайдер
 * - routeMulti(task) — несколько подходящих провайдеров
 * - delegate(task, opts) — route + invoke с fallback
 */

import { getProvider, invoke, listProviders, healthCheckAll } from './index.js';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readJsonFile, withLockSync, writeJsonAtomic } from '../utils/state-io.js';
import { rankCandidates } from '../evaluation/adaptive-weight.js';
import { createEvalStore as _createEvalStoreFn } from '../evaluation/eval-store.js';
import { initRoutingLogger, logDecision, shutdownRoutingLogger } from '../evaluation/routing-logger.js';
import { consumeRoutingOverride, normalizeRoutingConfig } from '../contracts/config-schemas.js';
import { parseRoutingDecision } from '../contracts/runtime-schemas.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.CTX_DATA_DIR || join(__dirname, '..', '..', '.data');
const PIPELINE_FILE = join(DATA_DIR, 'pipeline.json');
const PIPELINE_LOCK_FILE = join(DATA_DIR, '.pipeline.lock');
const ROUTING_CONFIG_FILE = join(DATA_DIR, 'routing-config.json');


// ---- Adaptive routing (feature-flagged) ----
let _evalStore = undefined;
function getEvalStore() {
  if (_evalStore !== undefined) return _evalStore;
  if (process.env.CTX_ADAPTIVE_ROUTING === '0') { _evalStore = null; return null; }
  try {
    _evalStore = _createEvalStoreFn(process.env.CTX_DATA_DIR || join(__dirname, '..', '..', '.data'));
    initRoutingLogger(_evalStore);
  } catch (err) {
    console.error('[router] adaptive disabled:', err.message);
    _evalStore = null;
  }
  return _evalStore;
}

process.on('exit', () => { shutdownRoutingLogger(); _evalStore?.close(); });

// ---- Routing config cache ----
let _configCache = null;
let _configCacheTime = 0;
const CONFIG_CACHE_TTL = 10_000; // 10 seconds

/**
 * Load routing config from .data/routing-config.json.
 * Cached for 10 seconds to avoid disk I/O on every route() call.
 * @returns {{ enabled?: boolean, threshold?: number, overrides?: object }}
 */
function loadRoutingConfig() {
  const now = Date.now();
  if (_configCache && (now - _configCacheTime) < CONFIG_CACHE_TTL) {
    return _configCache;
  }
  _configCache = normalizeRoutingConfig(readJsonFile(ROUTING_CONFIG_FILE, {}));
  _configCacheTime = now;
  return _configCache;
}

/**
 * Invalidate routing config cache (call after writes).
 */
function invalidateConfigCache() {
  _configCache = null;
  _configCacheTime = 0;
}

/**
 * Check if a task_type has an active override.
 * Decrements remaining count and returns provider if active.
 * @param {string} taskType
 * @returns {string|null} provider name or null
 */
function checkOverride(taskType) {
  if (!taskType) return null;
  try {
    const { provider, changed, config } = consumeRoutingOverride(loadRoutingConfig(), taskType);
    if (!provider) return null;
    if (changed) {
      writeJsonAtomic(ROUTING_CONFIG_FILE, config);
      invalidateConfigCache();
    }
    return provider;
  } catch {
    return null;
  }
}

/**
 * Check if adaptive routing should be active.
 * Auto-enables when readiness gate is met, unless env var forces off.
 */
function isAdaptiveActive(evalStore) {
  if (process.env.CTX_ADAPTIVE_ROUTING === '0') return false;
  const config = loadRoutingConfig();
  if (config.enabled === false) return false;
  try {
    const { isReady } = evalStore.getReadiness();
    return isReady;
  } catch {
    return false;
  }
}

/**
 * Get per-task-type metrics with fallback to global.
 * Uses task-type metrics if >= 10 data points, otherwise global.
 */
function getMetricsForTask(evalStore, taskType) {
  if (taskType) {
    try {
      const taskMetrics = evalStore.getProviderMetricsByTaskType(taskType);
      // Check if we have enough data points
      let totalSamples = 0;
      for (const [, m] of taskMetrics.providers) {
        totalSamples += m.total_responses || 0;
      }
      if (totalSamples >= 10) return taskMetrics;
    } catch { /* fallback */ }
  }
  return evalStore.getProviderMetrics();
}

// \b не работает с кириллицей — используем (?:^|[\s,;.!?]) как границу слова
const B = '(?:^|[\\s,;.!?:()\\[\\]"\'«»])'; // before
const A = '(?=$|[\\s,;.!?:()\\[\\]"\'«»])';  // after

const TASK_PATTERNS = [
  // Code review
  { pattern: new RegExp(`${B}(review|ревью|code.?review|проверь.?код|PR.?review)${A}`, 'i'), strength: 'code_review', provider: 'codex', weight: 10 },

  // Codebase analysis (large context)
  { pattern: new RegExp(`(анализ|audit|аудит|весь проект|full project|codebase|всю кодовую базу|проанализируй)`, 'i'), strength: 'codebase_analysis', provider: 'gemini', weight: 10 },

  // Documentation
  { pattern: new RegExp(`(документаци|readme|docs|jsdoc|api.?docs|описание проекта)`, 'i'), strength: 'documentation', provider: 'gemini', weight: 8 },

  // Sandbox execution
  { pattern: new RegExp(`${B}(exec|запусти|выполни|скрипт|execute|sandbox)${A}`, 'i'), strength: 'sandbox_exec', provider: 'codex', weight: 7 },

  // Translation / i18n
  { pattern: new RegExp(`(перевод|перевед|i18n|локализаци|translate|translation)`, 'i'), strength: 'translation', provider: 'gemini', weight: 9 },

  // Refactoring
  { pattern: new RegExp(`(рефактор|refactor|оптимизаци|optimize|clean.?up)`, 'i'), strength: 'refactoring', provider: 'codex', weight: 7 },

  // Planning / architecture
  { pattern: new RegExp(`(план|plan|архитектур|architecture|декомпозици|design|проектирован|спланируй)`, 'i'), strength: 'planning', provider: 'claude', weight: 9 },

  // Workflow / pipeline
  { pattern: new RegExp(`(workflow|pipeline|автоматизаци|ci.?cd|hooks|оркестраци)`, 'i'), strength: 'workflow', provider: 'claude', weight: 8 },

  // Multi-step orchestration
  { pattern: new RegExp(`(мульти|multi.?step|последовательн|поэтапн|step.?by.?step)`, 'i'), strength: 'orchestration', provider: 'claude', weight: 7 },

  // JSON / structured output
  { pattern: new RegExp(`${B}(json|structured|структурирован|schema)${A}`, 'i'), strength: 'json_output', provider: 'opencode', weight: 6 },

  // Multi-model tasks
  { pattern: new RegExp(`(сравни.?модел|compare.?models|multi.?model|разные модели)`, 'i'), strength: 'multi_model', provider: 'opencode', weight: 8 },

  // Diff / patch apply
  { pattern: new RegExp(`${B}(diff|patch|apply|примени изменения)${A}`, 'i'), strength: 'diff_apply', provider: 'codex', weight: 6 },
];

/**
 * Определить тип задачи и рекомендовать лучшего провайдера.
 * @param {string} task — описание задачи
 * @returns {{ provider: string, strength: string, reason: string, confidence: number } | null}
 */
export function route(task) {
  const matches = [];

  for (const rule of TASK_PATTERNS) {
    if (rule.pattern.test(task)) {
      const provider = getProvider(rule.provider);
      if (!provider) continue;

      matches.push({
        provider: rule.provider,
        mode: provider.mode,
        strength: rule.strength,
        reason: provider.bestFor?.[rule.strength] || rule.strength,
        weight: rule.weight
      });
    }
  }

  if (matches.length === 0) return null;

  // Determine task type from best static match
  const staticSorted = [...matches].sort((a, b) => b.weight - a.weight);
  const taskType = staticSorted[0]?.strength;

  // Check manual override
  const overrideProvider = checkOverride(taskType);
  if (overrideProvider) {
    const match = matches.find(m => m.provider === overrideProvider) || staticSorted[0];
    logDecision({
      task, taskType,
      selectedProvider: overrideProvider,
      runnerUp: staticSorted[0]?.provider !== overrideProvider ? staticSorted[0]?.provider : staticSorted[1]?.provider,
      finalScore: 1.0, staticComponent: 1.0,
      evalComponent: 0, feedbackComponent: 0, exploreComponent: 0, alpha: 0,
      routingMode: 'override'
    });
    return parseRoutingDecision({
      provider: overrideProvider,
      mode: getProvider(overrideProvider)?.mode,
      strength: match.strength || taskType,
      reason: `Manual override for ${taskType}`,
      confidence: 1.0
    });
  }

  // Adaptive scoring with readiness gate
  const evalStore = getEvalStore();
  if (evalStore && isAdaptiveActive(evalStore)) {
    try {
      const { providers: metricsMap, globalWinRate } = getMetricsForTask(evalStore, taskType);
      const ranked = rankCandidates(matches, metricsMap, { globalWinRate });
      if (ranked.length > 0) {
        const best = ranked[0];
        logDecision({
          task, taskType: best.strength,
          selectedProvider: best.provider,
          runnerUp: ranked[1]?.provider,
          finalScore: best.confidence,
          staticComponent: best.adaptive?.staticComponent ?? 0,
          evalComponent: best.adaptive?.evalComponent ?? 0,
          feedbackComponent: best.adaptive?.feedbackComponent ?? 0,
          exploreComponent: best.adaptive?.exploreComponent ?? 0,
          alpha: best.adaptive?.alpha ?? 0,
          runnerUpScore: ranked[1]?.confidence,
          staticBest: staticSorted[0]?.provider,
          routingMode: 'adaptive'
        });
        return parseRoutingDecision({
          provider: best.provider,
          mode: best.mode,
          strength: best.strength,
          reason: best.reason,
          confidence: best.confidence
        });
      }
    } catch (err) {
      // Fallthrough to static routing
    }
  }

  // Статический routing (default)
  const best = staticSorted[0];

  logDecision({
    task, taskType: best.strength,
    selectedProvider: best.provider,
    runnerUp: staticSorted[1]?.provider,
    finalScore: Math.min(best.weight / 10, 1),
    staticComponent: Math.min(best.weight / 10, 1),
    evalComponent: 0, feedbackComponent: 0, exploreComponent: 0, alpha: 0,
    routingMode: 'static'
  });

  return parseRoutingDecision({
    provider: best.provider,
    mode: best.mode,
    strength: best.strength,
    reason: best.reason,
    confidence: Math.min(best.weight / 10, 1)
  });
}

/**
 * Рекомендовать несколько провайдеров для задачи.
 * @param {string} task — описание задачи
 * @returns {Array<{ provider: string, strength: string, reason: string, confidence: number }>}
 */
export function routeMulti(task) {
  const matches = [];
  const seen = new Set();

  for (const rule of TASK_PATTERNS) {
    if (rule.pattern.test(task) && !seen.has(rule.provider)) {
      const provider = getProvider(rule.provider);
      if (!provider) continue;

      seen.add(rule.provider);
      matches.push({
        provider: rule.provider,
        mode: provider.mode,
        strength: rule.strength,
        reason: provider.bestFor?.[rule.strength] || rule.strength,
        weight: rule.weight,
        confidence: Math.min(rule.weight / 10, 1)
      });
    }
  }

  // Determine task type from best static match
  const staticSorted = [...matches].sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
  const taskType = staticSorted[0]?.strength;

  // Adaptive scoring with readiness gate
  const evalStore = getEvalStore();
  if (evalStore && isAdaptiveActive(evalStore)) {
    try {
      const { providers: metricsMap, globalWinRate } = getMetricsForTask(evalStore, taskType);
      const ranked = rankCandidates(matches, metricsMap, { globalWinRate });
      if (ranked.length > 0) {
        logDecision({
          task, taskType: ranked[0].strength || 'multi',
          selectedProvider: ranked[0].provider,
          runnerUp: ranked[1]?.provider,
          finalScore: ranked[0].confidence,
          staticComponent: ranked[0].adaptive?.staticComponent ?? 0,
          evalComponent: ranked[0].adaptive?.evalComponent ?? 0,
          feedbackComponent: ranked[0].adaptive?.feedbackComponent ?? 0,
          exploreComponent: ranked[0].adaptive?.exploreComponent ?? 0,
          alpha: ranked[0].adaptive?.alpha ?? 0,
          runnerUpScore: ranked[1]?.confidence,
          staticBest: staticSorted[0]?.provider,
          routingMode: 'adaptive'
        });
        return ranked;
      }
    } catch (err) {
      // Fallthrough to static sorting
    }
  }

  const sorted = matches.sort((a, b) => b.confidence - a.confidence);
  if (sorted.length > 0) {
    logDecision({
      task, taskType: sorted[0].strength || 'multi',
      selectedProvider: sorted[0].provider,
      runnerUp: sorted[1]?.provider,
      finalScore: sorted[0].confidence,
      staticComponent: sorted[0].confidence,
      evalComponent: 0, feedbackComponent: 0, exploreComponent: 0, alpha: 0,
      routingMode: 'static'
    });
  }
  return sorted;
}

/**
 * Делегировать задачу: route → invoke, с fallback на следующего подходящего.
 * @param {string} task — описание задачи
 * @param {object} opts — { provider?, timeout?, cwd?, multi? }
 */
export async function delegate(task, opts = {}) {
  // Явный выбор провайдера
  if (opts.provider) {
    const result = await invoke(opts.provider, task, opts);
    return { provider: opts.provider, routing: 'explicit', ...result };
  }

  // Мульти-делегирование
  if (opts.multi) {
    const candidates = routeMulti(task);
    if (candidates.length === 0) {
      return { status: 'error', error: 'no_matching_provider', detail: 'Не удалось определить подходящего провайдера' };
    }

    const results = await Promise.allSettled(
      candidates.map(async c => {
        const result = await invoke(c.provider, task, opts);
        return { provider: c.provider, strength: c.strength, routing: 'multi', ...result };
      })
    );

    return results.map(r =>
      r.status === 'fulfilled' ? r.value : { status: 'error', error: r.reason?.message }
    );
  }

  // Авто-роутинг с fallback
  const candidates = routeMulti(task);
  if (candidates.length === 0) {
    // Fallback на claude как дефолтный оркестратор
    const result = await invoke('claude', task, opts);
    return { provider: 'claude', routing: 'fallback_default', ...result };
  }

  // Пробуем кандидатов по приоритету
  for (const candidate of candidates) {
    // Проверяем circuit breaker через listProviders
    const providers = listProviders();
    const providerStatus = providers.find(p => p.name === candidate.provider);
    if (providerStatus?.circuitOpen) continue;

    const result = await invoke(candidate.provider, task, opts);
    if (result.status === 'success') {
      return {
        provider: candidate.provider,
        mode: candidate.mode,
        strength: candidate.strength,
        reason: candidate.reason,
        routing: 'auto',
        ...result
      };
    }
    // При ошибке — пробуем следующего кандидата
  }

  // Все кандидаты упали — fallback
  return { status: 'error', error: 'all_providers_failed', detail: 'Все подходящие провайдеры недоступны' };
}

// Self-test при прямом запуске
if (process.argv[1] && process.argv[1].includes('router.js')) {
  console.log('=== Smart Router Self-Test ===\n');

  const tests = [
    'сделай code review этого PR',
    'проанализируй весь проект',
    'сгенерируй документацию для API',
    'запусти тесты в sandbox',
    'переведи весь проект на английский',
    'сделай рефакторинг модуля auth',
    'спланируй архитектуру микросервисов',
    'настрой CI/CD pipeline',
    'сравни модели для этой задачи',
    'просто помоги мне с кодом',
  ];

  for (const task of tests) {
    const result = route(task);
    const multi = routeMulti(task);
    console.log(`Task: "${task}"`);
    if (result) {
      console.log(`  → ${result.provider} (${result.strength}, confidence: ${result.confidence})`);
    } else {
      console.log('  → no match (fallback: claude)');
    }
    if (multi.length > 1) {
      console.log(`  Multi: ${multi.map(m => m.provider).join(', ')}`);
    }
    console.log();
  }
}

/**
 * Explain routing decision for a task (for debugging and MCP tool).
 * @param {string} task — task description
 * @returns {{ taskType: string|null, candidates: Array, readiness: object, winner: object|null, mode: string }}
 */
export function explain(task) {
  const matches = [];
  for (const rule of TASK_PATTERNS) {
    if (rule.pattern.test(task)) {
      const provider = getProvider(rule.provider);
      if (!provider) continue;
      matches.push({
        provider: rule.provider,
        mode: provider.mode,
        strength: rule.strength,
        reason: provider.bestFor?.[rule.strength] || rule.strength,
        weight: rule.weight
      });
    }
  }

  const staticSorted = [...matches].sort((a, b) => b.weight - a.weight);
  const taskType = staticSorted[0]?.strength || null;

  // Readiness info
  let readiness = { totalRuns: 0, isReady: false, alpha: 0, adaptiveEnabled: false };
  const evalStore = getEvalStore();
  if (evalStore) {
    try { readiness = evalStore.getReadiness(); } catch { /* ignore */ }
  }

  // Override check (non-destructive — don't decrement)
  const config = loadRoutingConfig();
  const override = config.overrides?.[taskType];
  const activeOverride = override?.provider && (override.remaining == null || override.remaining > 0)
    ? { provider: override.provider, remaining: override.remaining ?? 'unlimited' }
    : null;

  if (matches.length === 0) {
    return { taskType: null, candidates: [], readiness, winner: null, mode: 'no_match', override: activeOverride };
  }

  // Score all candidates
  let candidates;
  let mode = 'static';
  if (evalStore && isAdaptiveActive(evalStore)) {
    try {
      const { providers: metricsMap, globalWinRate } = getMetricsForTask(evalStore, taskType);
      candidates = rankCandidates(matches, metricsMap, { globalWinRate }).map(c => ({
        provider: c.provider,
        strength: c.strength,
        finalScore: +(c.confidence || 0).toFixed(4),
        staticComponent: +(c.adaptive?.staticComponent ?? 0).toFixed(4),
        evalComponent: +(c.adaptive?.evalComponent ?? 0).toFixed(4),
        feedbackComponent: +(c.adaptive?.feedbackComponent ?? 0).toFixed(4),
        exploreComponent: +(c.adaptive?.exploreComponent ?? 0).toFixed(4),
        alpha: +(c.adaptive?.alpha ?? 0).toFixed(4),
        staticWeight: c.weight
      }));
      mode = 'adaptive';
    } catch {
      candidates = staticSorted.map(c => ({
        provider: c.provider, strength: c.strength,
        finalScore: +(Math.min(c.weight / 10, 1)).toFixed(4),
        feedbackComponent: 0,
        staticWeight: c.weight
      }));
    }
  } else {
    candidates = staticSorted.map(c => ({
      provider: c.provider, strength: c.strength,
      finalScore: +(Math.min(c.weight / 10, 1)).toFixed(4),
      feedbackComponent: 0,
      staticWeight: c.weight
    }));
  }

  const winner = activeOverride
    ? { provider: activeOverride.provider, mode: 'override' }
    : candidates[0] ? { provider: candidates[0].provider, mode } : null;

  return { taskType, candidates, readiness, winner, mode, override: activeOverride };
}

/**
 * Сменить ведущего провайдера pipeline.
 * Проверяет health, обновляет pipeline.lead.
 * @param {string} providerName — имя провайдера
 * @returns {{ success: boolean, lead: string, error?: string }}
 */
export async function setLead(providerName) {
  const provider = getProvider(providerName);
  if (!provider) {
    return { success: false, error: `Unknown provider: ${providerName}` };
  }

  // Health check
  const health = await provider.healthCheck();
  if (!health.available) {
    return { success: false, error: `Provider ${providerName} is not available: ${health.reason || 'unknown'}` };
  }

  // Update pipeline.json
  try {
    let prevLead = 'claude';
    withLockSync(PIPELINE_LOCK_FILE, () => {
      const pipeline = existsSync(PIPELINE_FILE) ? readJsonFile(PIPELINE_FILE, {}) : {};
      prevLead = pipeline.lead || 'claude';
      pipeline.lead = providerName;
      pipeline.updatedAt = new Date().toISOString();
      writeJsonAtomic(PIPELINE_FILE, pipeline);
    });
    return { success: true, lead: providerName, previous: prevLead };
  } catch (err) {
    return { success: false, error: `Failed to update pipeline: ${err.message}` };
  }
}

export { loadRoutingConfig, ROUTING_CONFIG_FILE };
export default { route, routeMulti, delegate, setLead, explain };
