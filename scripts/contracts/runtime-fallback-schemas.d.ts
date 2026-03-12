import { z } from 'zod';

export const RuntimeFallbackActionSchema: z.ZodTypeAny;
export const RuntimeStorageFallbackModeSchema: z.ZodTypeAny;
export const RuntimeProviderFallbackRoleSchema: z.ZodTypeAny;
export const RuntimeFallbackStorageSchema: z.ZodTypeAny;
export const RuntimeFallbackProviderCandidateSchema: z.ZodTypeAny;
export const RuntimeFallbackProvidersSchema: z.ZodTypeAny;
export const RuntimeFallbackInventorySchema: z.ZodTypeAny;

export function parseRuntimeFallbackInventory(input: unknown): unknown;
export function buildRuntimeFallbackInventory(options?: {
  shellSummary?: unknown;
  providerExtensibility?: unknown;
  now?: string;
}): unknown;
