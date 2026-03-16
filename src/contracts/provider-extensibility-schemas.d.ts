import { z } from 'zod';

export const ProviderDiscoveryInputKindSchema: z.ZodTypeAny;
export const ProviderModelSourceSchema: z.ZodTypeAny;
export const ProviderPluginSurfaceSchema: z.ZodTypeAny;
export const ProviderExtensibilityLevelSchema: z.ZodTypeAny;
export const ProviderDiscoveryInputSchema: z.ZodTypeAny;
export const ProviderExtensibilityRecordSchema: z.ZodTypeAny;
export const ProviderExtensibilityInventorySummarySchema: z.ZodTypeAny;
export const ProviderExtensibilityInventorySchema: z.ZodTypeAny;

export function parseProviderExtensibilityInventory(input: unknown): unknown;
export function createProviderExtensibilityRecord(input: unknown): unknown;
export function buildProviderExtensibilityInventory(options?: {
  generatedAt?: string;
  providers?: unknown[];
}): unknown;
