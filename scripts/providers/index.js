/**
 * Provider Registry — единая точка доступа ко всем AI провайдерам.
 *
 * Функции:
 * - Регистрация и discovery провайдеров
 * - Circuit breaker (skip после 3 последовательных ошибок, reset через 5 мин)
 * - Health check
 * - Параллельный invoke для consilium
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import claude from './claude.js';
import gemini from './gemini.js';
import opencode from './opencode.js';
import codex from './codex.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const HEALTH_FILE = join(__dirname, '..', '..', '.data', 'provider-health.json');
const CIRCUIT_THRESHOLD = 3;
const CIRCUIT_RESET_MS = 5 * 60 * 1000; // 5 minutes

const providers = { claude, gemini, opencode, codex };

function toNonNegativeInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) return fallback;
  return parsed;
}

function toLatencyMs(value) {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.round(parsed);
}

function applyLatencyStats(entry, latencyMs) {
  const calls = toNonNegativeInt(entry.calls, 0);
  const lastLatencyMs = toLatencyMs(latencyMs);
  const totalLatencyMs = toNonNegativeInt(entry.totalLatencyMs, 0) + lastLatencyMs;
  const avgLatencyMs = calls > 0 ? Math.round(totalLatencyMs / calls) : 0;
  return { ...entry, lastLatencyMs, totalLatencyMs, avgLatencyMs };
}

function loadHealth() {
  try {
    return JSON.parse(readFileSync(HEALTH_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

function saveHealth(health) {
  try {
    writeFileSync(HEALTH_FILE, JSON.stringify(health, null, 2));
  } catch { /* ignore write errors */ }
}

function isCircuitOpen(providerName) {
  const health = loadHealth();
  const entry = health[providerName];
  if (!entry) return false;
  if (toNonNegativeInt(entry.failures, 0) < CIRCUIT_THRESHOLD) return false;

  // Check if reset timeout passed
  const elapsed = Date.now() - new Date(entry.lastFailure).getTime();
  if (elapsed > CIRCUIT_RESET_MS) {
    // Half-open: allow one attempt
    entry.failures = CIRCUIT_THRESHOLD - 1;
    saveHealth(health);
    return false;
  }
  return true;
}

function recordSuccess(providerName, latencyMs) {
  const health = loadHealth();
  const now = new Date().toISOString();
  const entry = health[providerName] || {};
  const calls = toNonNegativeInt(entry.calls, 0) + 1;
  const successes = toNonNegativeInt(entry.successes, 0) + 1;
  const totalFailures = toNonNegativeInt(entry.totalFailures, 0);
  const next = {
    ...entry,
    calls,
    successes,
    totalFailures,
    failures: 0,
    lastSuccess: now,
    updatedAt: now,
    successRate: calls > 0 ? Number(((successes / calls) * 100).toFixed(1)) : 0
  };
  health[providerName] = applyLatencyStats(next, latencyMs);
  saveHealth(health);
}

function recordFailure(providerName, latencyMs) {
  const health = loadHealth();
  const now = new Date().toISOString();
  const entry = health[providerName] || {};
  const calls = toNonNegativeInt(entry.calls, 0) + 1;
  const successes = toNonNegativeInt(entry.successes, 0);
  const totalFailures = toNonNegativeInt(entry.totalFailures, 0) + 1;
  const consecutiveFailures = toNonNegativeInt(entry.failures, 0) + 1;
  const next = {
    ...entry,
    calls,
    successes,
    totalFailures,
    failures: consecutiveFailures,
    lastFailure: now,
    updatedAt: now,
    successRate: calls > 0 ? Number(((successes / calls) * 100).toFixed(1)) : 0
  };
  health[providerName] = applyLatencyStats(next, latencyMs);
  saveHealth(health);
}

/**
 * Получить список всех зарегистрированных провайдеров.
 */
export function listProviders() {
  return Object.values(providers).map(p => ({
    name: p.name,
    transport: p.transport,
    capabilities: p.capabilities,
    circuitOpen: isCircuitOpen(p.name)
  }));
}

/**
 * Получить провайдера по имени.
 */
export function getProvider(name) {
  return providers[name] || null;
}

/**
 * Вызвать провайдера с circuit breaker.
 */
export async function invoke(providerName, prompt, opts = {}) {
  const provider = providers[providerName];
  if (!provider) return { status: 'error', error: `Unknown provider: ${providerName}` };

  if (isCircuitOpen(providerName)) {
    return {
      status: 'circuit_open',
      error: `Provider ${providerName} is temporarily disabled (${CIRCUIT_THRESHOLD} consecutive failures). Resets in 5 min.`
    };
  }

  const startedAt = Date.now();
  try {
    const result = await provider.invoke(prompt, opts);
    const latencyMs = Date.now() - startedAt;

    if (result.status === 'success') {
      recordSuccess(providerName, latencyMs);
    } else {
      recordFailure(providerName, latencyMs);
    }

    return result;
  } catch (err) {
    const latencyMs = Date.now() - startedAt;
    recordFailure(providerName, latencyMs);
    return {
      status: 'error',
      error: err instanceof Error ? err.message : String(err)
    };
  }
}

/**
 * Вызвать всех доступных провайдеров параллельно (для consilium).
 * Пропускает провайдеров с открытым circuit breaker.
 */
export async function invokeAll(prompt, opts = {}) {
  const available = Object.keys(providers).filter(name => !isCircuitOpen(name));

  const results = await Promise.allSettled(
    available.map(async name => {
      const result = await invoke(name, prompt, opts);
      return { provider: name, ...result };
    })
  );

  return results.map(r =>
    r.status === 'fulfilled' ? r.value : { provider: 'unknown', status: 'error', error: r.reason?.message }
  );
}

/**
 * Проверить здоровье всех провайдеров.
 */
export async function healthCheckAll() {
  const checks = await Promise.allSettled(
    Object.values(providers).map(async p => ({
      name: p.name,
      ...(await p.healthCheck()),
      circuitOpen: isCircuitOpen(p.name)
    }))
  );

  return checks.map(r =>
    r.status === 'fulfilled' ? r.value : { name: 'unknown', available: false }
  );
}

export { route, routeMulti, delegate, setLead } from './router.js';

export default { listProviders, getProvider, invoke, invokeAll, healthCheckAll };
