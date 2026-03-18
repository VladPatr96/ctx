/**
 * Model Discovery — динамическое обнаружение доступных моделей провайдеров.
 *
 * Источники:
 * - Claude:   статический список (nested CLI недоступен)
 * - Gemini:   статический список (нет `gemini models` команды)
 * - Codex:    ~/.codex/config.toml → model field
 * - OpenCode: `opencode models` CLI + opencode.json (project config)
 *
 * Результат кэшируется на время жизни процесса (TTL 5 мин).
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runCommand } from '../core/utils/shell.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

// ---- Cache ----
const CACHE_TTL_MS = 5 * 60 * 1000;
const _cache = new Map(); // providerName → { models, defaultModel, ts }

function getCached(provider) {
  const entry = _cache.get(provider);
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) return entry.data;
  return null;
}

function setCache(provider, models, defaultModel) {
  const data = { models, defaultModel };
  _cache.set(provider, { data, ts: Date.now() });
  return data;
}

// ---- Claude ----

const CLAUDE_STATIC_MODELS = [
  { id: 'claude-opus-4-6', alias: 'opus-4.6', tier: 'flagship' },
  { id: 'claude-sonnet-4-6', alias: 'sonnet-4.6', tier: 'balanced' },
  { id: 'claude-haiku-4-5-20251001', alias: 'haiku-4.5', tier: 'fast' },
];

function discoverClaude() {
  const cached = getCached('claude');
  if (cached) return cached;

  return setCache('claude', CLAUDE_STATIC_MODELS, 'opus-4.6');
}

// ---- Gemini ----

const GEMINI_STATIC_MODELS = [
  { id: 'gemini-3.1-pro-preview', alias: 'gemini-3.1-pro', tier: 'flagship' },
  { id: 'gemini-3-pro-preview', alias: 'gemini-3-pro', tier: 'flagship' },
  { id: 'gemini-3-flash-preview', alias: 'gemini-3-flash', tier: 'fast' },
  { id: 'gemini-2.5-pro', alias: 'gemini-2.5-pro', tier: 'balanced' },
  { id: 'gemini-2.5-flash', alias: 'gemini-2.5-flash', tier: 'fast' },
];

function discoverGemini() {
  const cached = getCached('gemini');
  if (cached) return cached;

  return setCache('gemini', GEMINI_STATIC_MODELS, 'gemini-3.1-pro-preview');
}

// ---- Codex ----

/**
 * Parse minimal TOML — extracts top-level key = "value" pairs.
 * Не полный парсер, но достаточный для config.toml codex.
 */
function parseSimpleToml(content) {
  const result = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('[')) continue;
    const match = trimmed.match(/^(\w+)\s*=\s*"([^"]*)"/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

function discoverCodex() {
  const cached = getCached('codex');
  if (cached) return cached;

  let defaultModel = 'o3';
  const models = [];

  // Read ~/.codex/config.toml
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const configPath = join(home, '.codex', 'config.toml');
  if (home && existsSync(configPath)) {
    try {
      const content = readFileSync(configPath, 'utf-8');
      const parsed = parseSimpleToml(content);
      if (parsed.model) {
        defaultModel = parsed.model;
      }
    } catch { /* ignore read errors */ }
  }

  // Codex doesn't expose model list — use default from config
  models.push({ id: defaultModel, alias: defaultModel, tier: 'flagship' });

  return setCache('codex', models, defaultModel);
}

// ---- OpenCode ----

/**
 * Extract models from an opencode.json config object.
 * Reads top-level model, small_model, modes, and provider.models sections.
 */
function extractOpenCodeModels(config) {
  const models = [];

  // 1. Extract from modes (zai-coding-plan, zai-regular, etc.)
  if (config.mode) {
    for (const [modeName, modeConfig] of Object.entries(config.mode)) {
      if (modeConfig.model) {
        models.push({ id: modeConfig.model, alias: `${modeName}/main`, tier: 'flagship', mode: modeName });
      }
      if (modeConfig.small_model) {
        models.push({ id: modeConfig.small_model, alias: `${modeName}/small`, tier: 'fast', mode: modeName });
      }
    }
  }

  // 2. Extract from provider.*.models (openai, google, ccs-agy, etc.)
  if (config.provider) {
    for (const [providerName, providerConfig] of Object.entries(config.provider)) {
      if (!providerConfig.models) continue;
      for (const [modelId, modelMeta] of Object.entries(providerConfig.models)) {
        if (models.find(m => m.id === modelId)) continue;
        const name = modelMeta.name || modelId;
        let tier = 'standard';
        const idLower = modelId.toLowerCase();
        if (idLower.includes('flash') || /\bmini\b/.test(idLower) || idLower.includes('small') || idLower.includes('lite')) tier = 'fast';
        else if (idLower.includes('pro') || idLower.includes('opus') || /\bmax\b/.test(idLower) || idLower.includes('codex') || /gpt-5\.\d/.test(idLower) || idLower.includes('glm-5') || idLower.includes('thinking')) tier = 'flagship';
        models.push({ id: modelId, alias: name, tier, provider: providerName });
      }
    }
  }

  // 3. Add top-level model/small_model if not already present
  if (config.model && !models.find(m => m.id === config.model)) {
    models.push({ id: config.model, alias: 'default', tier: 'flagship' });
  }
  if (config.small_model && !models.find(m => m.id === config.small_model)) {
    models.push({ id: config.small_model, alias: 'default/small', tier: 'fast' });
  }

  return models;
}

// OpenCode Go subscription models ($10/mo) — available via opencode-go/ prefix
const OPENCODE_GO_MODELS = [
  { id: 'opencode-go/glm-5', alias: 'GLM-5 (Go)', tier: 'flagship', provider: 'opencode-go' },
  { id: 'opencode-go/kimi-k2.5', alias: 'Kimi K2.5 (Go)', tier: 'flagship', provider: 'opencode-go' },
  { id: 'opencode-go/minimax-m2.5', alias: 'MiniMax M2.5 (Go)', tier: 'balanced', provider: 'opencode-go' },
];

function discoverOpenCodeSync() {
  const cached = getCached('opencode');
  if (cached) return cached;

  const allModels = new Map(); // id → model entry (dedup)
  let defaultModel = null;

  // 1. Read global config: ~/.config/opencode/opencode.json
  const home = process.env.USERPROFILE || process.env.HOME || '';
  const globalConfigPath = join(home, '.config', 'opencode', 'opencode.json');
  if (home && existsSync(globalConfigPath)) {
    try {
      const config = JSON.parse(readFileSync(globalConfigPath, 'utf-8'));
      if (config.model) defaultModel = config.model;
      for (const m of extractOpenCodeModels(config)) allModels.set(m.id, m);
    } catch { /* ignore parse errors */ }
  }

  // 2. Read project config: ./opencode.json (overrides globals)
  const projectConfigPath = join(PROJECT_ROOT, 'opencode.json');
  if (existsSync(projectConfigPath)) {
    try {
      const config = JSON.parse(readFileSync(projectConfigPath, 'utf-8'));
      if (config.model) defaultModel = config.model;
      for (const m of extractOpenCodeModels(config)) allModels.set(m.id, m);
    } catch { /* ignore parse errors */ }
  }

  // 3. OpenCode Go subscription models (override config-derived entries with proper metadata)
  for (const m of OPENCODE_GO_MODELS) allModels.set(m.id, m);

  if (!defaultModel) defaultModel = 'opencode-go/glm-5';

  return setCache('opencode', [...allModels.values()], defaultModel);
}

/**
 * Async discovery for OpenCode — runs `opencode models` CLI.
 * Дополняет sync-результат полным списком доступных моделей.
 */
async function discoverOpenCodeAsync() {
  // Start with sync config
  const syncResult = discoverOpenCodeSync();

  try {
    const result = await runCommand('opencode', ['models'], { timeout: 10000 });
    if (result.success && result.stdout) {
      const lines = result.stdout.trim().split('\n').map(l => l.trim()).filter(Boolean);
      const cliModels = [];

      for (const line of lines) {
        // Determine tier from model name
        let tier = 'standard';
        if (line.includes('flash') || line.includes('nano') || line.includes('lite') || line.includes('free')) {
          tier = 'fast';
        } else if (line.includes('pro') || line.includes('glm-5') || line.includes('opus')) {
          tier = 'flagship';
        }

        // Extract provider prefix
        const parts = line.split('/');
        const provider = parts.length > 1 ? parts[0] : 'opencode';

        cliModels.push({
          id: line,
          alias: parts.length > 1 ? parts[1] : line,
          tier,
          provider
        });
      }

      // Merge: CLI models + config models (config models take priority for metadata)
      const merged = new Map();
      for (const m of cliModels) merged.set(m.id, m);
      for (const m of syncResult.models) merged.set(m.id, m); // config overwrites

      const allModels = [...merged.values()];
      return setCache('opencode', allModels, syncResult.defaultModel);
    }
  } catch { /* CLI unavailable — use sync result */ }

  return syncResult;
}

// ---- Public API ----

/**
 * Discover models for a specific provider (sync, from cache/configs).
 * @param {string} providerName
 * @returns {{ models: Array<{id, alias, tier}>, defaultModel: string }}
 */
export function discoverModels(providerName) {
  switch (providerName) {
    case 'claude': return discoverClaude();
    case 'gemini': return discoverGemini();
    case 'codex': return discoverCodex();
    case 'opencode': return discoverOpenCodeSync();
    default: return { models: [], defaultModel: null };
  }
}

/**
 * Async discovery — full model list including CLI queries.
 * @param {string} providerName
 * @returns {Promise<{ models: Array<{id, alias, tier}>, defaultModel: string }>}
 */
export async function discoverModelsAsync(providerName) {
  if (providerName === 'opencode') return discoverOpenCodeAsync();
  return discoverModels(providerName);
}

/**
 * Discover models for all providers.
 * @returns {Record<string, { models: Array, defaultModel: string }>}
 */
export function discoverAllModels() {
  return {
    claude: discoverClaude(),
    gemini: discoverGemini(),
    codex: discoverCodex(),
    opencode: discoverOpenCodeSync()
  };
}

/**
 * Async discovery for all providers (includes CLI queries).
 * @returns {Promise<Record<string, { models: Array, defaultModel: string }>>}
 */
export async function discoverAllModelsAsync() {
  const [claude, gemini, codex, opencode] = await Promise.all([
    discoverModelsAsync('claude'),
    discoverModelsAsync('gemini'),
    discoverModelsAsync('codex'),
    discoverModelsAsync('opencode')
  ]);
  return { claude, gemini, codex, opencode };
}

/**
 * Validate that a model is available for a provider.
 * @param {string} providerName
 * @param {string} modelId — model id or alias
 * @returns {{ valid: boolean, resolved: string|null, suggestion?: string }}
 */
export function validateModel(providerName, modelId) {
  const { models } = discoverModels(providerName);
  const normalized = String(modelId).trim().toLowerCase();

  // Exact match by id
  const byId = models.find(m => m.id.toLowerCase() === normalized);
  if (byId) return { valid: true, resolved: byId.id };

  // Match by alias
  const byAlias = models.find(m => m.alias.toLowerCase() === normalized);
  if (byAlias) return { valid: true, resolved: byAlias.id };

  // Partial match (contains)
  const partial = models.find(m =>
    m.id.toLowerCase().includes(normalized) || m.alias.toLowerCase().includes(normalized)
  );
  if (partial) return { valid: false, resolved: null, suggestion: partial.id };

  return { valid: false, resolved: null };
}

/**
 * Get the model list as simple string array (backward compatible).
 * @param {string} providerName
 * @returns {string[]}
 */
export function getModelIds(providerName) {
  const { models } = discoverModels(providerName);
  return models.map(m => m.id);
}

/**
 * Clear cache (for testing).
 */
export function _clearCache() {
  _cache.clear();
}
