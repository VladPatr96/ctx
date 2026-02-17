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
  if (entry.failures < CIRCUIT_THRESHOLD) return false;

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

function recordSuccess(providerName) {
  const health = loadHealth();
  health[providerName] = { failures: 0, lastSuccess: new Date().toISOString() };
  saveHealth(health);
}

function recordFailure(providerName) {
  const health = loadHealth();
  const entry = health[providerName] || { failures: 0 };
  entry.failures = (entry.failures || 0) + 1;
  entry.lastFailure = new Date().toISOString();
  health[providerName] = entry;
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

  const result = await provider.invoke(prompt, opts);

  if (result.status === 'success') {
    recordSuccess(providerName);
  } else {
    recordFailure(providerName);
  }

  return result;
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

export default { listProviders, getProvider, invoke, invokeAll, healthCheckAll };
