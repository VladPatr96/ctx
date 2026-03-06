/**
 * Pricing Data — централизованная база тарифов для всех провайдеров.
 *
 * Источники:
 * - Claude:   https://www.anthropic.com/pricing
 * - Gemini:   https://ai.google.dev/pricing
 * - Codex:    https://openai.com/pricing (GPT-based estimates)
 * - OpenCode: https://open.bigmodel.cn/pricing (ZhipuAI pricing)
 *
 * Все цены указаны в USD за миллион токенов (per MTok).
 * Результат кэшируется на время жизни процесса.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

// ---- Pricing Database ----

/**
 * Pricing data structure:
 * {
 *   inputCostPerMTok: number,   // Cost per 1 million input tokens (USD)
 *   outputCostPerMTok: number,  // Cost per 1 million output tokens (USD)
 *   tier: string,               // 'flagship' | 'balanced' | 'fast'
 *   updated: string             // ISO date of last price update
 * }
 */

const CLAUDE_PRICING = {
  'claude-opus-4-6': {
    inputCostPerMTok: 15.0,
    outputCostPerMTok: 75.0,
    tier: 'flagship',
    updated: '2026-03-01'
  },
  'claude-sonnet-4-6': {
    inputCostPerMTok: 3.0,
    outputCostPerMTok: 15.0,
    tier: 'balanced',
    updated: '2026-03-01'
  },
  'claude-haiku-4-5-20251001': {
    inputCostPerMTok: 0.25,
    outputCostPerMTok: 1.25,
    tier: 'fast',
    updated: '2026-03-01'
  },
  // Aliases
  'opus-4.6': {
    inputCostPerMTok: 15.0,
    outputCostPerMTok: 75.0,
    tier: 'flagship',
    updated: '2026-03-01'
  },
  'sonnet-4.6': {
    inputCostPerMTok: 3.0,
    outputCostPerMTok: 15.0,
    tier: 'balanced',
    updated: '2026-03-01'
  },
  'haiku-4.5': {
    inputCostPerMTok: 0.25,
    outputCostPerMTok: 1.25,
    tier: 'fast',
    updated: '2026-03-01'
  }
};

const GEMINI_PRICING = {
  'gemini-3.1-pro-preview': {
    inputCostPerMTok: 1.25,
    outputCostPerMTok: 5.0,
    tier: 'flagship',
    updated: '2026-03-01'
  },
  'gemini-3-pro-preview': {
    inputCostPerMTok: 1.25,
    outputCostPerMTok: 5.0,
    tier: 'flagship',
    updated: '2026-03-01'
  },
  'gemini-3-flash-preview': {
    inputCostPerMTok: 0.075,
    outputCostPerMTok: 0.30,
    tier: 'fast',
    updated: '2026-03-01'
  },
  'gemini-2.5-pro': {
    inputCostPerMTok: 1.25,
    outputCostPerMTok: 5.0,
    tier: 'balanced',
    updated: '2026-03-01'
  },
  'gemini-2.5-flash': {
    inputCostPerMTok: 0.075,
    outputCostPerMTok: 0.30,
    tier: 'fast',
    updated: '2026-03-01'
  },
  // Aliases
  'gemini-3.1-pro': {
    inputCostPerMTok: 1.25,
    outputCostPerMTok: 5.0,
    tier: 'flagship',
    updated: '2026-03-01'
  },
  'gemini-3-pro': {
    inputCostPerMTok: 1.25,
    outputCostPerMTok: 5.0,
    tier: 'flagship',
    updated: '2026-03-01'
  },
  'gemini-3-flash': {
    inputCostPerMTok: 0.075,
    outputCostPerMTok: 0.30,
    tier: 'fast',
    updated: '2026-03-01'
  }
};

const CODEX_PRICING = {
  'gpt-5.3-codex': {
    inputCostPerMTok: 10.0,
    outputCostPerMTok: 30.0,
    tier: 'flagship',
    updated: '2026-03-01'
  },
  'gpt-4-turbo': {
    inputCostPerMTok: 10.0,
    outputCostPerMTok: 30.0,
    tier: 'balanced',
    updated: '2026-03-01'
  },
  'gpt-4': {
    inputCostPerMTok: 30.0,
    outputCostPerMTok: 60.0,
    tier: 'flagship',
    updated: '2026-03-01'
  },
  'gpt-3.5-turbo': {
    inputCostPerMTok: 0.5,
    outputCostPerMTok: 1.5,
    tier: 'fast',
    updated: '2026-03-01'
  }
};

const OPENCODE_PRICING = {
  'opencode/glm-4.7': {
    inputCostPerMTok: 0.5,
    outputCostPerMTok: 0.5,
    tier: 'flagship',
    updated: '2026-03-01'
  },
  'opencode/glm-5': {
    inputCostPerMTok: 1.0,
    outputCostPerMTok: 1.0,
    tier: 'flagship',
    updated: '2026-03-01'
  },
  'opencode/glm-4-flash': {
    inputCostPerMTok: 0.1,
    outputCostPerMTok: 0.1,
    tier: 'fast',
    updated: '2026-03-01'
  },
  'opencode/glm-4-plus': {
    inputCostPerMTok: 0.5,
    outputCostPerMTok: 0.5,
    tier: 'balanced',
    updated: '2026-03-01'
  },
  // ZhipuAI models (OpenCode backend)
  'glm-4.7': {
    inputCostPerMTok: 0.5,
    outputCostPerMTok: 0.5,
    tier: 'flagship',
    updated: '2026-03-01'
  },
  'glm-5': {
    inputCostPerMTok: 1.0,
    outputCostPerMTok: 1.0,
    tier: 'flagship',
    updated: '2026-03-01'
  },
  'glm-4-flash': {
    inputCostPerMTok: 0.1,
    outputCostPerMTok: 0.1,
    tier: 'fast',
    updated: '2026-03-01'
  },
  'glm-4-plus': {
    inputCostPerMTok: 0.5,
    outputCostPerMTok: 0.5,
    tier: 'balanced',
    updated: '2026-03-01'
  },
  // OpenAI models via OpenCode
  'openai/gpt-4': {
    inputCostPerMTok: 30.0,
    outputCostPerMTok: 60.0,
    tier: 'flagship',
    updated: '2026-03-01'
  },
  'openai/gpt-3.5-turbo': {
    inputCostPerMTok: 0.5,
    outputCostPerMTok: 1.5,
    tier: 'fast',
    updated: '2026-03-01'
  },
  // Anthropic models via OpenCode
  'anthropic/claude-3-opus': {
    inputCostPerMTok: 15.0,
    outputCostPerMTok: 75.0,
    tier: 'flagship',
    updated: '2026-03-01'
  },
  'anthropic/claude-3-sonnet': {
    inputCostPerMTok: 3.0,
    outputCostPerMTok: 15.0,
    tier: 'balanced',
    updated: '2026-03-01'
  }
};

// ---- Cache ----

const _cache = new Map(); // provider/modelId → pricing object

function getCacheKey(provider, modelId) {
  return `${provider}/${modelId}`;
}

// ---- Default Fallback Pricing ----

/**
 * Default pricing for unknown models based on tier patterns.
 * Used when exact model pricing is unavailable.
 */
const DEFAULT_PRICING = {
  flagship: {
    inputCostPerMTok: 10.0,
    outputCostPerMTok: 30.0,
    tier: 'flagship',
    updated: '2026-03-01',
    estimated: true
  },
  balanced: {
    inputCostPerMTok: 2.0,
    outputCostPerMTok: 6.0,
    tier: 'balanced',
    updated: '2026-03-01',
    estimated: true
  },
  fast: {
    inputCostPerMTok: 0.2,
    outputCostPerMTok: 0.6,
    tier: 'fast',
    updated: '2026-03-01',
    estimated: true
  }
};

// ---- Provider Pricing Maps ----

const PROVIDER_PRICING_MAP = {
  claude: CLAUDE_PRICING,
  gemini: GEMINI_PRICING,
  codex: CODEX_PRICING,
  opencode: OPENCODE_PRICING
};

// ---- Main API ----

/**
 * Get pricing for a specific provider and model.
 * Returns pricing object with input/output costs per MTok.
 *
 * @param {string} provider - Provider name (claude, gemini, codex, opencode)
 * @param {string} modelId - Model ID or alias
 * @returns {Object|null} Pricing object or null if not found
 */
export function getPricing(provider, modelId) {
  if (!provider || !modelId) return null;

  const cacheKey = getCacheKey(provider, modelId);
  if (_cache.has(cacheKey)) {
    return _cache.get(cacheKey);
  }

  // Normalize provider name
  const normalizedProvider = provider.toLowerCase();
  const pricingMap = PROVIDER_PRICING_MAP[normalizedProvider];

  if (!pricingMap) {
    // Unknown provider — return estimated pricing
    const fallback = estimatePricing(modelId);
    _cache.set(cacheKey, fallback);
    return fallback;
  }

  // Lookup exact model
  let pricing = pricingMap[modelId];

  // Try case-insensitive lookup
  if (!pricing) {
    const lowerModelId = modelId.toLowerCase();
    for (const [key, value] of Object.entries(pricingMap)) {
      if (key.toLowerCase() === lowerModelId) {
        pricing = value;
        break;
      }
    }
  }

  // Try partial match for aliases
  if (!pricing) {
    for (const [key, value] of Object.entries(pricingMap)) {
      if (modelId.includes(key) || key.includes(modelId)) {
        pricing = value;
        break;
      }
    }
  }

  // Fallback to estimated pricing
  if (!pricing) {
    pricing = estimatePricing(modelId);
  }

  _cache.set(cacheKey, pricing);
  return pricing;
}

/**
 * Estimate pricing for unknown models based on name patterns.
 *
 * @param {string} modelId - Model ID
 * @returns {Object} Estimated pricing object
 */
function estimatePricing(modelId) {
  const lowerModelId = modelId.toLowerCase();

  // Determine tier from model name
  if (lowerModelId.includes('flash') || lowerModelId.includes('nano') ||
      lowerModelId.includes('lite') || lowerModelId.includes('haiku') ||
      lowerModelId.includes('turbo') || lowerModelId.includes('free')) {
    return { ...DEFAULT_PRICING.fast };
  }

  if (lowerModelId.includes('opus') || lowerModelId.includes('pro') ||
      lowerModelId.includes('glm-5') || lowerModelId.includes('gpt-5') ||
      lowerModelId.includes('gpt-4') && !lowerModelId.includes('turbo')) {
    return { ...DEFAULT_PRICING.flagship };
  }

  return { ...DEFAULT_PRICING.balanced };
}

/**
 * Get all pricing data for a provider.
 *
 * @param {string} provider - Provider name
 * @returns {Object|null} Map of modelId → pricing, or null if provider unknown
 */
export function getProviderPricing(provider) {
  const normalizedProvider = provider.toLowerCase();
  return PROVIDER_PRICING_MAP[normalizedProvider] || null;
}

/**
 * Get list of all supported providers.
 *
 * @returns {string[]} Array of provider names
 */
export function getSupportedProviders() {
  return Object.keys(PROVIDER_PRICING_MAP);
}

/**
 * Calculate cost from token usage.
 *
 * @param {string} provider - Provider name
 * @param {string} modelId - Model ID
 * @param {number} inputTokens - Number of input tokens
 * @param {number} outputTokens - Number of output tokens
 * @returns {number} Total cost in USD
 */
export function calculateCost(provider, modelId, inputTokens, outputTokens) {
  const pricing = getPricing(provider, modelId);
  if (!pricing) return 0;

  const inputCost = (inputTokens / 1_000_000) * pricing.inputCostPerMTok;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputCostPerMTok;

  return inputCost + outputCost;
}

/**
 * Load custom pricing from project config.
 * Allows users to override default pricing with their own negotiated rates.
 *
 * @returns {Object} Custom pricing overrides or empty object
 */
function loadCustomPricing() {
  const configPath = join(PROJECT_ROOT, '.data', 'custom-pricing.json');
  if (!existsSync(configPath)) return {};

  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

/**
 * Apply custom pricing overrides from config.
 */
export function applyCustomPricing() {
  const customPricing = loadCustomPricing();

  for (const [provider, models] of Object.entries(customPricing)) {
    const normalizedProvider = provider.toLowerCase();
    if (!PROVIDER_PRICING_MAP[normalizedProvider]) continue;

    for (const [modelId, pricing] of Object.entries(models)) {
      if (pricing.inputCostPerMTok !== undefined && pricing.outputCostPerMTok !== undefined) {
        PROVIDER_PRICING_MAP[normalizedProvider][modelId] = {
          ...pricing,
          updated: new Date().toISOString().split('T')[0],
          custom: true
        };
      }
    }
  }
}

// Auto-apply custom pricing on module load
applyCustomPricing();
