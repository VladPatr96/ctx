import { z } from 'zod';

export const InterfaceSourceSchema = z.enum(['built_in', 'skill']);

export const CliCommandSurfaceSchema = z.object({
  name: z.string().min(1),
  source: InterfaceSourceSchema,
  description: z.string().min(1),
  usage: z.string().min(1),
  skill: z.string().nullable(),
  category: z.string().nullable(),
}).strict();

export const McpToolSurfaceSchema = z.object({
  name: z.string().min(1),
  source: InterfaceSourceSchema,
  description: z.string().min(1),
  inputType: z.string().min(1),
  skill: z.string().nullable(),
  category: z.string().nullable(),
}).strict();

const InterfaceSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  builtIn: z.number().int().nonnegative(),
  skill: z.number().int().nonnegative(),
}).strict();

export const InterfaceReferenceSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  cli: z.object({
    commands: z.array(CliCommandSurfaceSchema),
    summary: InterfaceSummarySchema,
  }).strict(),
  mcp: z.object({
    tools: z.array(McpToolSurfaceSchema),
    summary: InterfaceSummarySchema,
  }).strict(),
}).strict();

export function parseInterfaceReference(input) {
  return InterfaceReferenceSchema.parse(input);
}

export function createInterfaceReference({ generatedAt, cliCommands, mcpTools }) {
  const normalizedCliCommands = cliCommands.map((command) => CliCommandSurfaceSchema.parse(command));
  const normalizedMcpTools = mcpTools.map((tool) => McpToolSurfaceSchema.parse(tool));

  return parseInterfaceReference({
    generatedAt,
    cli: {
      commands: normalizedCliCommands,
      summary: summarizeBySource(normalizedCliCommands),
    },
    mcp: {
      tools: normalizedMcpTools,
      summary: summarizeBySource(normalizedMcpTools),
    },
  });
}

function summarizeBySource(entries) {
  return {
    total: entries.length,
    builtIn: entries.filter((entry) => entry.source === 'built_in').length,
    skill: entries.filter((entry) => entry.source === 'skill').length,
  };
}
