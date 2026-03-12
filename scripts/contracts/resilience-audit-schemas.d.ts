import { z } from 'zod';

export const ResilienceAuditScopeSchema: z.ZodTypeAny;
export const ResilienceAuditTargetSchema: z.ZodTypeAny;
export const ResilienceAuditTransitionSchema: z.ZodTypeAny;
export const ResilienceAuditSeveritySchema: z.ZodTypeAny;
export const ResilienceThrottleModeSchema: z.ZodTypeAny;
export const ResilienceNotificationKindSchema: z.ZodTypeAny;
export const ResilienceAuditActionSchema: z.ZodTypeAny;
export const ResilienceAuditEventSchema: z.ZodTypeAny;
export const ResilienceNotificationSchema: z.ZodTypeAny;
export const ResilienceThrottleHintSchema: z.ZodTypeAny;
export const ResilienceAuditInventorySchema: z.ZodTypeAny;

export function parseResilienceAuditInventory(input: unknown): unknown;
export function buildResilienceAuditInventory(options?: {
  shellSummary?: unknown;
  providerRecovery?: unknown;
  runtimeFallbacks?: unknown;
  now?: string;
}): unknown;
