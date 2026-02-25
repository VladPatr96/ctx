/**
 * routing-logger.js — Async buffer for logging routing decisions.
 *
 * Zero hot-path overhead: decisions are buffered and flushed asynchronously.
 * Feature-flagged by CTX_ADAPTIVE_ROUTING env var.
 */

const MAX_SNIPPET_LEN = 120;
const FLUSH_INTERVAL_MS = 500;
const FLUSH_THRESHOLD = 10;

let _store = null;
let _buffer = [];
let _flushTimer = null;
let _enabled = false;

/**
 * Initialize the routing logger with an eval store.
 * @param {object} store — eval store with insertRoutingDecisionBatch method
 */
export function initRoutingLogger(store) {
  if (!store || process.env.CTX_ADAPTIVE_ROUTING !== '1') {
    _enabled = false;
    return;
  }
  _store = store;
  _enabled = true;
  _buffer = [];

  if (_flushTimer) clearInterval(_flushTimer);
  _flushTimer = setInterval(() => {
    if (_buffer.length > 0) flush();
  }, FLUSH_INTERVAL_MS);
  _flushTimer.unref();
}

/**
 * Log a routing decision. Non-blocking, buffers for batch write.
 * @param {object} decision
 * @param {string} decision.task — full task text
 * @param {string} decision.taskType — detected task type (strength)
 * @param {string} decision.selectedProvider — chosen provider
 * @param {string} [decision.runnerUp] — second-best provider
 * @param {number} decision.finalScore — final adaptive score
 * @param {number} decision.staticComponent — static score component
 * @param {number} decision.evalComponent — eval score component
 * @param {number} decision.exploreComponent — explore bonus component
 * @param {number} decision.alpha — current alpha value
 * @param {number} [decision.runnerUpScore] — runner-up's final score
 * @param {string} [decision.staticBest] — best provider by static routing
 * @param {string} decision.routingMode — 'adaptive' or 'static'
 */
export function logDecision(decision) {
  if (!_enabled) return;

  const snippet = (decision.task || '').slice(0, MAX_SNIPPET_LEN);
  const selectedProvider = decision.selectedProvider || '';
  const runnerUp = decision.runnerUp || null;
  const finalScore = decision.finalScore ?? 0;
  const runnerUpScore = decision.runnerUpScore ?? null;
  const delta = (runnerUp && runnerUpScore != null) ? finalScore - runnerUpScore : null;
  const isDiverged = decision.staticBest && selectedProvider !== decision.staticBest ? 1 : 0;

  _buffer.push({
    timestamp: new Date().toISOString(),
    task_snippet: snippet,
    task_type: decision.taskType || 'unknown',
    selected_provider: selectedProvider,
    runner_up: runnerUp,
    final_score: finalScore,
    static_component: decision.staticComponent ?? 0,
    eval_component: decision.evalComponent ?? 0,
    explore_component: decision.exploreComponent ?? 0,
    alpha: decision.alpha ?? 0,
    delta,
    is_diverged: isDiverged,
    routing_mode: decision.routingMode || 'static'
  });

  if (_buffer.length >= FLUSH_THRESHOLD) {
    setImmediate(() => flush());
  }
}

/**
 * Flush buffered decisions to the store.
 */
export function flush() {
  if (!_store || _buffer.length === 0) return;

  const batch = _buffer.splice(0);
  try {
    _store.insertRoutingDecisionBatch(batch);
  } catch (err) {
    // Fail silently — logging must never break routing
    console.error('[routing-logger] flush failed:', err.message);
  }
}

/**
 * Shutdown the logger: flush remaining and clear timer.
 */
export function shutdownRoutingLogger() {
  flush();
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
  _enabled = false;
}

/**
 * Get current buffer size (for monitoring/testing).
 * @returns {number}
 */
export function getBufferSize() {
  return _buffer.length;
}

/**
 * Reset internal state for testing.
 */
export function _resetForTest() {
  if (_flushTimer) {
    clearInterval(_flushTimer);
    _flushTimer = null;
  }
  _store = null;
  _buffer = [];
  _enabled = false;
}
