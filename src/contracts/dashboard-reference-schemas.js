import { z } from 'zod';

const HttpMethodSchema = z.enum(['GET', 'POST']);
const TransportSchema = z.enum(['http', 'sse']);
const AuthSchema = z.enum(['public', 'bearer_token', 'bearer_or_query_token']);

export const DashboardHttpEndpointSchema = z.object({
  id: z.string().min(1),
  method: HttpMethodSchema,
  transport: TransportSchema,
  path: z.string().min(1),
  aliases: z.array(z.string()).default([]),
  pathParams: z.array(z.string()).default([]),
  queryParams: z.array(z.string()).default([]),
  auth: AuthSchema,
  category: z.string().min(1),
  purpose: z.string().min(1),
  requestShape: z.string().nullable().default(null),
  responseShape: z.string().nullable().default(null),
  clientMethod: z.string().nullable().default(null),
}).strict();

export const DesktopIpcMethodSchema = z.object({
  id: z.string().min(1),
  api: z.string().min(1),
  channel: z.string().min(1),
  category: z.string().min(1),
  purpose: z.string().min(1),
  requestShape: z.string().nullable().default(null),
  responseShape: z.string().nullable().default(null),
}).strict();

export const DesktopRuntimeSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  main: z.string().min(1),
  shell: z.literal('electron'),
  renderer: z.literal('react_vite'),
}).strict();

export const DesktopNavigationSchema = z.object({
  defaultTab: z.string().min(1),
  tabs: z.array(z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    icon: z.string().min(1),
    focusTargetId: z.string().optional(),
  }).strict()),
  shortcuts: z.array(z.object({
    key: z.string().min(1),
    tab: z.string().min(1),
    focusTargetId: z.string().nullable().default(null),
  }).strict()),
}).strict();

export const DesktopConnectionBudgetSchema = z.object({
  baseReconnectDelayMs: z.number().int().nonnegative(),
  maxReconnectDelayMs: z.number().int().nonnegative(),
  staleAfterMs: z.number().int().nonnegative(),
  recoveryPollMs: z.number().int().nonnegative(),
  minRecoveryIntervalMs: z.number().int().nonnegative(),
}).strict();

export const ShellSummaryContractSchema = z.object({
  topLevelFields: z.array(z.string()),
  sessionFields: z.array(z.string()),
  projectFields: z.array(z.string()),
  storageFields: z.array(z.string()),
  providersFields: z.array(z.string()),
  providerCardFields: z.array(z.string()),
}).strict();

const CountSummarySchema = z.object({
  total: z.number().int().nonnegative(),
}).catchall(z.number().int().nonnegative());

export const DashboardDesktopReferenceSchema = z.object({
  generatedAt: z.string().datetime({ offset: true }),
  desktop: z.object({
    runtime: DesktopRuntimeSchema,
    navigation: DesktopNavigationSchema,
    connectionBudget: DesktopConnectionBudgetSchema,
    shellSummaryContract: ShellSummaryContractSchema,
    ipc: z.object({
      methods: z.array(DesktopIpcMethodSchema),
      summary: CountSummarySchema,
    }).strict(),
  }).strict(),
  dashboard: z.object({
    endpoints: z.array(DashboardHttpEndpointSchema),
    summary: CountSummarySchema,
  }).strict(),
  notes: z.array(z.string()),
}).strict();

export function parseDashboardDesktopReference(input) {
  return DashboardDesktopReferenceSchema.parse(input);
}

export function createDashboardDesktopReference({
  generatedAt,
  desktop,
  dashboardEndpoints,
  ipcMethods,
  notes = [],
}) {
  const normalizedEndpoints = dashboardEndpoints.map((entry) => DashboardHttpEndpointSchema.parse(entry));
  const normalizedIpcMethods = ipcMethods.map((entry) => DesktopIpcMethodSchema.parse(entry));

  return parseDashboardDesktopReference({
    generatedAt,
    desktop: {
      ...desktop,
      ipc: {
        methods: normalizedIpcMethods,
        summary: summarizeIpcMethods(normalizedIpcMethods),
      },
    },
    dashboard: {
      endpoints: normalizedEndpoints,
      summary: summarizeHttpEndpoints(normalizedEndpoints),
    },
    notes,
  });
}

function summarizeIpcMethods(entries) {
  const summary = {
    total: entries.length,
  };

  for (const entry of entries) {
    summary[entry.category] = (summary[entry.category] || 0) + 1;
  }

  return summary;
}

function summarizeHttpEndpoints(entries) {
  return {
    total: entries.length,
    get: entries.filter((entry) => entry.method === 'GET').length,
    post: entries.filter((entry) => entry.method === 'POST').length,
    sse: entries.filter((entry) => entry.transport === 'sse').length,
    public: entries.filter((entry) => entry.auth === 'public').length,
    protected: entries.filter((entry) => entry.auth !== 'public').length,
    clientBound: entries.filter((entry) => entry.clientMethod).length,
    operatorOnly: entries.filter((entry) => !entry.clientMethod).length,
  };
}
