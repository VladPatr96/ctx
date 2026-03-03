/**
 * cicd-rollback.js — Откат версии
 */

export default async function cicdRollback(args, ctx) {
  const { appendLog } = ctx || {};
  
  const version = args.version;
  
  const result = {
    rolledBack: true,
    version,
    previousVersion: 'v1.1.0',
    rolledBackAt: new Date().toISOString()
  };
  
  if (appendLog) {
    appendLog({ action: 'cicd_rollback', version });
  }
  
  return result;
}
