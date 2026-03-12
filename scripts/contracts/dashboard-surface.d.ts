export type DashboardHttpMethod = 'GET' | 'POST';
export type DashboardTransport = 'http' | 'sse';
export type DashboardAuth = 'public' | 'bearer_token' | 'bearer_or_query_token';

export interface DashboardHttpEndpoint {
  id: string;
  method: DashboardHttpMethod;
  transport: DashboardTransport;
  path: string;
  aliases: ReadonlyArray<string>;
  pathParams: ReadonlyArray<string>;
  queryParams: ReadonlyArray<string>;
  auth: DashboardAuth;
  category: string;
  purpose: string;
  requestShape: string | null;
  responseShape: string | null;
  clientMethod: string | null;
}

export interface DesktopIpcMethod {
  id: string;
  api: string;
  channel: string;
  category: string;
  purpose: string;
  requestShape: string | null;
  responseShape: string | null;
}

export const DASHBOARD_HTTP_ENDPOINTS: ReadonlyArray<DashboardHttpEndpoint>;
export const DASHBOARD_DESKTOP_IPC_METHODS: ReadonlyArray<DesktopIpcMethod>;

export function listDashboardHttpEndpoints(): DashboardHttpEndpoint[];
export function getDashboardHttpEndpoint(id: string): DashboardHttpEndpoint | null;
export function getDashboardHttpPath(id: string, params?: Record<string, string | number>): string;
export function listDashboardDesktopIpcMethods(): DesktopIpcMethod[];
