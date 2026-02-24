/**
 * adaptive-weight.js — Pure scoring functions for evaluation-driven routing.
 *
 * No I/O, no side effects. All functions are deterministic and easily testable.
 * Formula: final = (1-alpha-epsilon)*static/10 + alpha*evalScore + epsilon*exploreBonus
 */

/**
 * Convert average latency (ms) to a 0-1 score (faster = better).
 * Ceiling at 5000ms. null/undefined defaults to 0.5.
 * @param {number|null} avgMs
 * @returns {number}
 */
export function latencyScore(avgMs) {
  if (avgMs == null || typeof avgMs !== 'number' || Number.isNaN(avgMs)) return 0.5;
  if (avgMs <= 0) return 1.0;
  if (avgMs >= 5000) return 0.0;
  return 1.0 - avgMs / 5000;
}

/**
 * Bayesian-smoothed win rate for cold-start protection.
 * Formula: (wins + k * globalWinRate) / (n + k)
 * @param {number} wins — number of wins
 * @param {number} n — total responses
 * @param {number} globalWinRate — prior (global average win rate)
 * @param {number} [k=3] — smoothing strength
 * @returns {number}
 */
export function smoothedWinRate(wins, n, globalWinRate, k = 3) {
  if (n + k === 0) return globalWinRate || 0;
  return (wins + k * globalWinRate) / (n + k);
}

/**
 * Compute alpha (eval weight) based on sample count.
 * Ramps linearly from 0 to 0.35 over 100 samples, capped at 0.35.
 * @param {number} sampleCount
 * @returns {number}
 */
export function computeAlpha(sampleCount) {
  if (!sampleCount || sampleCount <= 0) return 0;
  return Math.min(0.35, (sampleCount / 100) * 0.35);
}

/**
 * Composite evaluation score from provider metrics.
 * Formula: 0.5 * smoothedWin + 0.3 * confidence + 0.2 * latency
 * @param {{ wins: number, total_responses: number, avg_confidence: number, avg_response_ms: number }} metrics
 * @param {number} globalWinRate
 * @returns {number}
 */
export function evalScore(metrics, globalWinRate) {
  const winRate = smoothedWinRate(
    metrics.wins || 0,
    metrics.total_responses || 0,
    globalWinRate
  );
  const confidence = metrics.avg_confidence ?? 0.5;
  const latency = latencyScore(metrics.avg_response_ms);

  return 0.5 * winRate + 0.3 * confidence + 0.2 * latency;
}

/**
 * Compute adaptive final score blending static weight with eval metrics.
 * @param {{ staticWeight: number, metrics: object|null, globalWinRate: number, options?: { epsilon?: number } }} params
 * @returns {{ finalScore: number, staticComponent: number, evalComponent: number, exploreComponent: number, alpha: number }}
 */
export function adaptiveScore({ staticWeight, metrics, globalWinRate, options = {} }) {
  const epsilon = options.epsilon ?? 0.05;

  // No metrics → pure static
  if (!metrics) {
    return {
      finalScore: staticWeight / 10,
      staticComponent: staticWeight / 10,
      evalComponent: 0,
      exploreComponent: 0,
      alpha: 0
    };
  }

  const sampleCount = metrics.total_responses || 0;
  const alpha = computeAlpha(sampleCount);
  const eval_ = evalScore(metrics, globalWinRate);
  const exploreBonus = sampleCount < 10 ? 1.0 : 0.0;

  const staticComponent = (1 - alpha - epsilon) * (staticWeight / 10);
  const evalComponent = alpha * eval_;
  const exploreComponent = epsilon * exploreBonus;
  const finalScore = staticComponent + evalComponent + exploreComponent;

  return { finalScore, staticComponent, evalComponent, exploreComponent, alpha };
}

/**
 * Rank candidates using adaptive scoring.
 * Each candidate must have { provider, weight, ...rest }.
 * metricsMap is Map<string, metrics> from eval-store.
 * @param {Array<{ provider: string, weight: number }>} candidates
 * @param {Map<string, object>} metricsMap
 * @param {{ globalWinRate?: number, epsilon?: number }} [options={}]
 * @returns {Array<{ provider: string, confidence: number, adaptive: object }>}
 */
export function rankCandidates(candidates, metricsMap, options = {}) {
  if (!candidates || candidates.length === 0) return [];

  const globalWinRate = options.globalWinRate ?? 0.25;

  const scored = candidates.map(candidate => {
    const metrics = metricsMap?.get(candidate.provider) || null;
    const adaptive = adaptiveScore({
      staticWeight: candidate.weight ?? 5,
      metrics,
      globalWinRate,
      options: { epsilon: options.epsilon ?? 0.05 }
    });

    return {
      ...candidate,
      confidence: adaptive.finalScore,
      adaptive
    };
  });

  scored.sort((a, b) => b.confidence - a.confidence);
  return scored;
}
