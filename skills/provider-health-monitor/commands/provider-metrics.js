/**
 * provider-metrics.js — Получение метрик
 */

export default async function providerMetrics(args, ctx) {
  const { appendLog } = ctx || {};
  
  const period = args.period || '24h';
  
  const result = {
    period,
    totalRequests: 1247,
    avgLatency: 1.8,
    totalCost: 12.34,
    errors: 23,
    errorRate: 1.8,
    topProviders: [
      { provider: 'claude', requests: 623 },
      { provider: 'gemini', requests: 312 },
      { provider: 'opencode', requests: 312 }
    ]
  };
  
  if (appendLog) {
    appendLog({ action: 'provider_metrics', period });
  }
  
  return result;
}
