/**
 * routing-anomaly.js — Pure anomaly detection for routing decisions.
 *
 * No I/O, no side effects. Same pattern as adaptive-weight.js.
 */

/**
 * Detect anomalies in routing decision statistics.
 * @param {{ avg_score: number, min_score: number, max_score: number, avg_alpha: number, min_alpha: number, max_alpha: number, avg_explore: number, diverged_count: number }} anomalyStats
 * @param {Array<{ selected_provider: string, cnt: number }>} distribution
 * @param {number} totalDecisions
 * @returns {Array<{ type: string, severity: string, message: string }>}
 */
export function detectAnomalies(anomalyStats, distribution, totalDecisions) {
  if (!totalDecisions || totalDecisions < 20) return [];

  const anomalies = [];

  // explore_dominates: avg_explore / avg_score > 0.3
  if (anomalyStats.avg_score > 0 && anomalyStats.avg_explore / anomalyStats.avg_score > 0.3) {
    anomalies.push({
      type: 'explore_dominates',
      severity: 'warn',
      message: `Explore component dominates scoring (${(anomalyStats.avg_explore / anomalyStats.avg_score * 100).toFixed(1)}% of avg score). Many cold-start providers may be inflating rankings.`
    });
  }

  // alpha_stuck: max_alpha - min_alpha < 0.02 when total > 50
  if (totalDecisions > 50 && (anomalyStats.max_alpha - anomalyStats.min_alpha) < 0.02) {
    anomalies.push({
      type: 'alpha_stuck',
      severity: 'warn',
      message: `Alpha range is very narrow (${anomalyStats.min_alpha.toFixed(3)}–${anomalyStats.max_alpha.toFixed(3)}). Eval weight may not be adapting to new data.`
    });
  }

  // score_drift: max_score - min_score > 0.5
  if ((anomalyStats.max_score - anomalyStats.min_score) > 0.5) {
    anomalies.push({
      type: 'score_drift',
      severity: 'critical',
      message: `Score range is very wide (${anomalyStats.min_score.toFixed(3)}–${anomalyStats.max_score.toFixed(3)}). Provider quality may be unstable.`
    });
  }

  // provider_monopoly: one provider > 85% of decisions
  if (distribution && distribution.length > 0) {
    for (const entry of distribution) {
      const share = entry.cnt / totalDecisions;
      if (share > 0.85) {
        anomalies.push({
          type: 'provider_monopoly',
          severity: 'warn',
          message: `Provider "${entry.selected_provider}" handles ${(share * 100).toFixed(1)}% of routing decisions. Diversity may be insufficient.`
        });
      }
    }
  }

  return anomalies;
}
