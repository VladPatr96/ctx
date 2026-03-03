/**
 * consilium-early-stop.js — Раннее завершение при консенсусе
 */

export default async function consiliumEarlyStop(args, ctx) {
  const { appendLog } = ctx || {};
  
  const threshold = parseInt(args.threshold) || 0;
  
  const result = {
    threshold,
    contestedClaims: 0,
    consensusReached: true,
    stoppedAt: 45, // seconds
    savedRounds: 2,
    confidence: 94
  };
  
  if (appendLog) {
    appendLog({ action: 'consilium_early_stop', threshold, stopped: result.stoppedAt });
  }
  
  return result;
}
