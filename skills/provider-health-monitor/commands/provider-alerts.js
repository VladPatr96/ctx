/**
 * provider-alerts.js — Получение алертов
 */

export default async function providerAlerts(args, ctx) {
  const { appendLog } = ctx || {};
  
  const severity = args.severity || 'all';
  
  const result = {
    alerts: [
      {
        severity: 'critical',
        provider: 'codex',
        message: 'Latency 4.2s (normal: 1.2s)',
        timestamp: new Date().toISOString()
      },
      {
        severity: 'warning',
        provider: 'gemini',
        message: 'Error rate 7%',
        timestamp: new Date().toISOString()
      }
    ],
    total: 2,
    critical: 1,
    warning: 1
  };
  
  if (appendLog) {
    appendLog({ action: 'provider_alerts', severity, count: result.total });
  }
  
  return result;
}
