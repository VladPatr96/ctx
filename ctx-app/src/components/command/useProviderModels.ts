import { useState, useEffect } from 'react';
import type { ApiClient, EnvironmentHealth } from '../../api/client';

export type ModelEntry = { id: string; alias: string; tier: string; mode?: string; provider?: string };
export type ProviderModels = Record<string, { models: ModelEntry[]; defaultModel: string }>;

const FALLBACK_MODELS: ProviderModels = {
  claude: { models: [{ id: 'claude-opus-4-6', alias: 'opus', tier: 'flagship' }, { id: 'claude-sonnet-4-6', alias: 'sonnet', tier: 'balanced' }, { id: 'claude-haiku-4-5-20251001', alias: 'haiku', tier: 'fast' }], defaultModel: 'claude-opus-4-6' },
  gemini: { models: [{ id: 'gemini-3.1-pro-preview', alias: '3.1-pro', tier: 'flagship' }, { id: 'gemini-3-pro-preview', alias: '3-pro', tier: 'balanced' }, { id: 'gemini-3-flash-preview', alias: '3-flash', tier: 'fast' }, { id: 'gemini-2.5-pro', alias: '2.5-pro', tier: 'balanced' }, { id: 'gemini-2.5-flash', alias: '2.5-flash', tier: 'fast' }], defaultModel: 'gemini-3.1-pro-preview' },
  codex: { models: [{ id: 'gpt-5.4', alias: 'gpt-5.4', tier: 'flagship' }], defaultModel: 'gpt-5.4' },
  opencode: { models: [{ id: 'zai-coding-plan/glm-5', alias: 'glm-5-plan', tier: 'flagship' }, { id: 'zai-coding-plan/glm-4.7-flashx', alias: 'glm-4.7-flashx', tier: 'fast' }, { id: 'zai/glm-5', alias: 'glm-5', tier: 'balanced' }, { id: 'zai/glm-4.7-flash', alias: 'glm-4.7-flash', tier: 'fast' }], defaultModel: 'zai-coding-plan/glm-5' },
};

let _cached: ProviderModels | null = null;

export function useProviderModels(client: ApiClient): { providerModels: ProviderModels; loading: boolean } {
  const [providerModels, setProviderModels] = useState<ProviderModels>(_cached || FALLBACK_MODELS);
  const [loading, setLoading] = useState(!_cached);

  useEffect(() => {
    if (_cached) return;
    let cancelled = false;

    client.getEnvironmentHealth().then((health) => {
      if (cancelled) return;
      if (health.models && Object.keys(health.models).length > 0) {
        _cached = health.models;
        setProviderModels(health.models);
      }
    }).catch(() => { /* use fallback */ }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [client]);

  return { providerModels, loading };
}

/** Get model IDs for a provider as a simple string array */
export function getModelIds(providerModels: ProviderModels, provider: string): string[] {
  return (providerModels[provider]?.models || []).map((m) => m.id);
}

/** Get default model for a provider */
export function getDefaultModel(providerModels: ProviderModels, provider: string): string {
  return providerModels[provider]?.defaultModel || providerModels[provider]?.models?.[0]?.id || '';
}
