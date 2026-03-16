import { z } from 'zod';
import {
  ProviderAdapterSchema,
  ExecutionTransportSchema,
} from '../providers/provider-modes.js';
import { ExecutionModeSchema } from './runtime-schemas.js';

export const ProviderHostInterfaceSchema = z.enum(['mcp_native', 'cli_wrapper']);

export const ProviderMigrationEntrySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  setupDescription: z.string().min(1),
  hostInterface: ProviderHostInterfaceSchema,
  hostMcpOptional: z.boolean(),
  setupCommand: z.string().min(1),
  preferredInvocation: z.string().min(1),
  configurationSurface: z.string().min(1),
  detectionSignals: z.array(z.string().min(1)).min(1),
  migrationNotes: z.array(z.string().min(1)).min(1),
  sourceDocs: z.array(z.string().min(1)).min(1),
  runtime: z.object({
    mode: ExecutionModeSchema,
    adapter: ProviderAdapterSchema,
    executionTransport: ExecutionTransportSchema,
    supportsCheckpointing: z.boolean(),
    supportsSuspend: z.boolean(),
    timeoutAction: z.string().min(1),
  }).strict(),
}).strict();

export const ProviderMigrationSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  byHostInterface: z.object({
    mcp_native: z.number().int().nonnegative(),
    cli_wrapper: z.number().int().nonnegative(),
  }).strict(),
  byRuntimeMode: z.object({
    api: z.number().int().nonnegative(),
    cli: z.number().int().nonnegative(),
    agent: z.number().int().nonnegative(),
  }).strict(),
  hostMcpOptional: z.number().int().nonnegative(),
}).strict();

export const ProviderMigrationArtifactSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  providers: z.array(ProviderMigrationEntrySchema).min(1),
  summary: ProviderMigrationSummarySchema,
}).strict();

export function parseProviderMigrationArtifact(input) {
  return ProviderMigrationArtifactSchema.parse(input);
}

export function createProviderMigrationArtifact({ generatedAt, providers }) {
  const normalizedProviders = providers.map((provider) => ProviderMigrationEntrySchema.parse(provider));
  const byHostInterface = {
    mcp_native: 0,
    cli_wrapper: 0,
  };
  const byRuntimeMode = {
    api: 0,
    cli: 0,
    agent: 0,
  };

  for (const provider of normalizedProviders) {
    byHostInterface[provider.hostInterface] += 1;
    byRuntimeMode[provider.runtime.mode] += 1;
  }

  return parseProviderMigrationArtifact({
    generatedAt,
    providers: normalizedProviders,
    summary: {
      total: normalizedProviders.length,
      byHostInterface,
      byRuntimeMode,
      hostMcpOptional: normalizedProviders.filter((provider) => provider.hostMcpOptional).length,
    },
  });
}

