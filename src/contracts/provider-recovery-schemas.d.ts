import { z } from 'zod';

export const ProviderRecoveryActionSchema: z.ZodTypeAny;
export const ProviderOutageLevelSchema: z.ZodTypeAny;
export const ProviderRecoveryHooksSchema: z.ZodTypeAny;
export const ProviderRecoveryPlanSchema: z.ZodTypeAny;
export const ProviderRecoveryInventorySchema: z.ZodTypeAny;

export function parseProviderRecoveryInventory(input: unknown): unknown;
export function buildProviderRecoveryInventory(options?: {
  shellSummary?: unknown;
  providerExtensibility?: unknown;
  runtimeFallbacks?: unknown;
  now?: string;
}): unknown;
