/**
 * eval-store.js — Evaluation store for consilium run tracking.
 *
 * Uses node:sqlite DatabaseSync (same pattern as storage/sqlite-store.js).
 * Fail-safe: write errors are caught and logged, never break main flow.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_FILE = join(__dirname, 'eval-schema.sql');

function ensureDir(path) {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

function loadDatabaseSync() {
  const mod = require('node:sqlite');
  if (!mod || typeof mod.DatabaseSync !== 'function') {
    throw new Error('node:sqlite DatabaseSync is unavailable');
  }
  return mod.DatabaseSync;
}

/**
 * Create an evaluation store backed by SQLite.
 * @param {string} dataDir — path to .data directory
 * @returns {object} store API
 */
export function createEvalStore(dataDir = '.data') {
  ensureDir(dataDir);

  const DatabaseSync = loadDatabaseSync();
  const dbPath = join(dataDir, 'state.sqlite');
  const db = new DatabaseSync(dbPath);

  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA synchronous = NORMAL;');
  db.exec('PRAGMA busy_timeout = 2000;');
  db.exec(readFileSync(SCHEMA_FILE, 'utf8'));

  // Idempotent schema migrations for runtime contracts
  try { db.exec('ALTER TABLE provider_responses ADD COLUMN task_type TEXT;'); } catch { /* already exists */ }
  try { db.exec('ALTER TABLE routing_decisions ADD COLUMN feedback_component REAL NOT NULL DEFAULT 0;'); } catch { /* already exists */ }

  // ---- Prepared statements ----

  const insertRunStmt = db.prepare(`
    INSERT INTO consilium_runs(run_id, project, topic, mode, providers_invoked, started_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertProviderStmt = db.prepare(`
    INSERT INTO provider_responses(run_id, provider, model, status, response_ms, confidence, key_idea, error_message, task_type)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const completeRunStmt = db.prepare(`
    UPDATE consilium_runs
    SET proposed_by = ?, consensus_reached = ?, decision_summary = ?,
        github_issue_url = ?, providers_responded = ?,
        ended_at = ?, duration_ms = ?, rounds = ?
    WHERE run_id = ?
  `);

  const updateCiStmt = db.prepare(`
    UPDATE consilium_runs SET ci_status = ? WHERE run_id = ?
  `);

  const markChosenStmt = db.prepare(`
    UPDATE provider_responses SET was_chosen = 1 WHERE run_id = ? AND provider = ?
  `);

  const getRunStmt = db.prepare(`
    SELECT * FROM consilium_runs WHERE run_id = ?
  `);

  const getLastRunsStmt = db.prepare(`
    SELECT * FROM consilium_runs ORDER BY started_at DESC LIMIT ?
  `);

  const getRunsByProjectStmt = db.prepare(`
    SELECT * FROM consilium_runs WHERE project = ? ORDER BY started_at DESC LIMIT ?
  `);

  const getProviderResponsesStmt = db.prepare(`
    SELECT * FROM provider_responses WHERE run_id = ?
  `);

  const countRunsStmt = db.prepare(`
    SELECT COUNT(*) as total FROM consilium_runs
  `);

  const countRunsByProjectStmt = db.prepare(`
    SELECT COUNT(*) as total FROM consilium_runs WHERE project = ?
  `);

  const avgRoundsStmt = db.prepare(`
    SELECT AVG(rounds) as avg_rounds, MIN(rounds) as min_rounds, MAX(rounds) as max_rounds
    FROM consilium_runs
  `);

  const consensusRateStmt = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN consensus_reached = 1 THEN 1 ELSE 0 END) as consensus_count
    FROM consilium_runs
  `);

  const providerWinRateStmt = db.prepare(`
    SELECT provider,
      COUNT(*) as total_responses,
      SUM(CASE WHEN was_chosen = 1 THEN 1 ELSE 0 END) as wins,
      AVG(response_ms) as avg_response_ms,
      AVG(confidence) as avg_confidence
    FROM provider_responses
    GROUP BY provider
    ORDER BY wins DESC
  `);

  const providerMetricsRawStmt = db.prepare(`
    SELECT provider, COUNT(*) as total_responses,
      SUM(CASE WHEN was_chosen = 1 THEN 1 ELSE 0 END) as wins,
      AVG(response_ms) as avg_response_ms, AVG(confidence) as avg_confidence
    FROM provider_responses WHERE status = 'completed' GROUP BY provider
  `);

  const globalWinRateStmt = db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN was_chosen = 1 THEN 1 ELSE 0 END), 0) as total_wins,
      COALESCE(COUNT(*), 0) as total_responses
    FROM provider_responses WHERE status = 'completed'
  `);

  const providerMetricsByTaskTypeStmt = db.prepare(`
    SELECT provider, COUNT(*) as total_responses,
      SUM(CASE WHEN was_chosen = 1 THEN 1 ELSE 0 END) as wins,
      AVG(response_ms) as avg_response_ms, AVG(confidence) as avg_confidence
    FROM provider_responses WHERE status = 'completed' AND task_type = ?
    GROUP BY provider
  `);

  const countCompletedRunsStmt = db.prepare(`
    SELECT COUNT(*) as total FROM consilium_runs WHERE ended_at IS NOT NULL
  `);

  // Metrics caching via external cache-store (if provided), with local fallback
  let _cacheStore = null;
  function invalidateMetricsCache(taskType = null) {
    _localCache.delete('metrics:global');
    if (taskType) _localCache.delete(`metrics:tasktype:${taskType}`);

    if (_cacheStore && typeof _cacheStore.delete === 'function') {
      try { _cacheStore.delete('metrics:global'); } catch { /* ignore */ }
      if (taskType) {
        try { _cacheStore.delete(`metrics:tasktype:${taskType}`); } catch { /* ignore */ }
      }
    }
  }

  function applyFeedbackStats(providers, rows) {
    for (const row of rows) {
      const existing = providers.get(row.provider) || {
        total_responses: 0,
        wins: 0,
        avg_response_ms: null,
        avg_confidence: null
      };
      const positive = row.positive_count || 0;
      const neutral = row.neutral_count || 0;
      const negative = row.negative_count || 0;
      const total = row.feedback_total || 0;
      const score = total > 0 ? (positive + neutral * 0.5) / total : 0.5;

      providers.set(row.provider, {
        ...existing,
        feedback_positive: positive,
        feedback_neutral: neutral,
        feedback_negative: negative,
        feedback_count: total,
        feedback_score: score
      });
    }
  }
  const _localCache = new Map(); // fallback: key → { value, time }

  const ciStatsStmt = db.prepare(`
    SELECT ci_status, COUNT(*) as cnt
    FROM consilium_runs
    WHERE ci_status IS NOT NULL
    GROUP BY ci_status
  `);

  const respondedProvidersStmt = db.prepare(`
    SELECT DISTINCT provider FROM provider_responses WHERE run_id = ?
  `);

  // ---- Routing decisions prepared statements ----

  const insertRoutingDecisionStmt = db.prepare(`
    INSERT INTO routing_decisions(timestamp, task_snippet, task_type, selected_provider, runner_up,
      final_score, static_component, eval_component, feedback_component, explore_component, alpha, delta, is_diverged, routing_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const getRoutingDecisionByIdStmt = db.prepare(`
    SELECT * FROM routing_decisions WHERE id = ?
  `);

  const getLastRoutingDecisionsStmt = db.prepare(`
    SELECT * FROM routing_decisions ORDER BY timestamp DESC LIMIT ?
  `);

  const countRoutingDecisionsStmt = db.prepare(`
    SELECT COUNT(*) as total FROM routing_decisions
  `);

  const routingProviderDistStmt = db.prepare(`
    SELECT selected_provider, COUNT(*) as cnt
    FROM routing_decisions WHERE timestamp > ?
    GROUP BY selected_provider
  `);

  const routingAnomalyStatsStmt = db.prepare(`
    SELECT
      AVG(final_score) as avg_score,
      MIN(final_score) as min_score,
      MAX(final_score) as max_score,
      AVG(alpha) as avg_alpha,
      MIN(alpha) as min_alpha,
      MAX(alpha) as max_alpha,
      AVG(explore_component) as avg_explore,
      SUM(is_diverged) as diverged_count
    FROM routing_decisions WHERE timestamp > ?
  `);

  const feedbackStatsByProviderStmt = db.prepare(`
    SELECT selected_provider as provider,
      COUNT(*) as feedback_total,
      SUM(CASE WHEN verdict = 'positive' THEN 1 ELSE 0 END) as positive_count,
      SUM(CASE WHEN verdict = 'neutral' THEN 1 ELSE 0 END) as neutral_count,
      SUM(CASE WHEN verdict = 'negative' THEN 1 ELSE 0 END) as negative_count
    FROM routing_feedback
    GROUP BY selected_provider
  `);

  const feedbackStatsByProviderTaskTypeStmt = db.prepare(`
    SELECT selected_provider as provider,
      COUNT(*) as feedback_total,
      SUM(CASE WHEN verdict = 'positive' THEN 1 ELSE 0 END) as positive_count,
      SUM(CASE WHEN verdict = 'neutral' THEN 1 ELSE 0 END) as neutral_count,
      SUM(CASE WHEN verdict = 'negative' THEN 1 ELSE 0 END) as negative_count
    FROM routing_feedback
    WHERE task_type = ?
    GROUP BY selected_provider
  `);

  const upsertRoutingFeedbackStmt = db.prepare(`
    INSERT INTO routing_feedback(decision_id, timestamp, selected_provider, task_type, verdict, note, actor)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(decision_id, actor) DO UPDATE SET
      timestamp = excluded.timestamp,
      selected_provider = excluded.selected_provider,
      task_type = excluded.task_type,
      verdict = excluded.verdict,
      note = excluded.note
  `);

  const getRoutingFeedbackByDecisionActorStmt = db.prepare(`
    SELECT * FROM routing_feedback WHERE decision_id = ? AND actor = ?
  `);

  const getRecentRoutingFeedbackStmt = db.prepare(`
    SELECT * FROM routing_feedback WHERE timestamp > ? ORDER BY timestamp DESC
  `);

  const deleteOldRoutingStmt = db.prepare(`
    DELETE FROM routing_decisions WHERE timestamp < ?
  `);

  // ---- Round responses prepared statements ----

  const insertRoundResponseStmt = db.prepare(`
    INSERT INTO round_responses(run_id, round, provider, alias, status, response_ms, response_text, confidence, position_changed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const getRoundResponsesStmt = db.prepare(`
    SELECT * FROM round_responses WHERE run_id = ? ORDER BY round, provider
  `);

  const getRoundSummaryStmt = db.prepare(`
    SELECT round, COUNT(*) as total,
      SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
      AVG(response_ms) as avg_ms,
      AVG(confidence) as avg_confidence,
      SUM(position_changed) as positions_changed
    FROM round_responses WHERE run_id = ? GROUP BY round ORDER BY round
  `);

  // ---- Store API ----

  const store = {
    /**
     * Start a new consilium run.
     * @returns {string} run_id (UUID)
     */
    startRun({ project, topic, mode = 'providers', providers = [] }) {
      const runId = randomUUID();
      const now = new Date().toISOString();
      try {
        insertRunStmt.run(
          runId, project, topic, mode,
          JSON.stringify(providers), now
        );
      } catch (err) {
        console.error('[eval-store] startRun failed:', err.message);
      }
      return runId;
    },

    /**
     * Record a provider's response.
     */
    addProviderResponse(runId, {
      provider, model = null, status = 'completed',
      response_ms = null, confidence = null, key_idea = null,
      error_message = null, task_type = null
    }) {
      try {
        insertProviderStmt.run(
          runId, provider, model, status,
          response_ms, confidence, key_idea, error_message, task_type
        );
      } catch (err) {
        console.error('[eval-store] addProviderResponse failed:', err.message);
      }
    },

    /**
     * Complete a consilium run with results.
     */
    completeRun(runId, {
      proposed_by = null, consensus = 1,
      decision_summary = null, github_issue_url = null,
      rounds = 1
    }) {
      try {
        const run = getRunStmt.get(runId);
        const now = new Date().toISOString();
        let durationMs = null;
        if (run && run.started_at) {
          durationMs = new Date(now).getTime() - new Date(run.started_at).getTime();
        }

        // Collect responded providers
        const responded = respondedProvidersStmt.all(runId).map(r => r.provider);

        completeRunStmt.run(
          proposed_by, consensus, decision_summary,
          github_issue_url, JSON.stringify(responded),
          now, durationMs, rounds, runId
        );

        // Mark winning provider
        if (proposed_by) {
          markChosenStmt.run(runId, proposed_by);
        }
      } catch (err) {
        console.error('[eval-store] completeRun failed:', err.message);
      }
    },

    /**
     * Update CI status for a completed run.
     */
    updateCiStatus(runId, status) {
      try {
        updateCiStmt.run(status, runId);
      } catch (err) {
        console.error('[eval-store] updateCiStatus failed:', err.message);
      }
    },

    /**
     * Get analytics report.
     */
    getReport({ project = null, last = 50 } = {}) {
      try {
        const runs = project
          ? getRunsByProjectStmt.all(project, last)
          : getLastRunsStmt.all(last);

        const total = project
          ? countRunsByProjectStmt.get(project)
          : countRunsStmt.get();

        const roundsStats = avgRoundsStmt.get();
        const consensusStats = consensusRateStmt.get();
        const providerStats = providerWinRateStmt.all();
        const ciStats = ciStatsStmt.all();

        return {
          total: total?.total || 0,
          rounds: {
            avg: roundsStats?.avg_rounds || 0,
            min: roundsStats?.min_rounds || 0,
            max: roundsStats?.max_rounds || 0
          },
          consensus_rate: consensusStats?.total
            ? (consensusStats.consensus_count / consensusStats.total * 100).toFixed(1) + '%'
            : 'N/A',
          providers: providerStats.map(p => ({
            provider: p.provider,
            responses: p.total_responses,
            wins: p.wins,
            win_rate: p.total_responses
              ? (p.wins / p.total_responses * 100).toFixed(1) + '%'
              : '0%',
            avg_response_ms: p.avg_response_ms ? Math.round(p.avg_response_ms) : null,
            avg_confidence: p.avg_confidence ? +p.avg_confidence.toFixed(2) : null
          })),
          ci: Object.fromEntries(ciStats.map(c => [c.ci_status, c.cnt])),
          recent_runs: runs.map(r => ({
            run_id: r.run_id,
            project: r.project,
            topic: r.topic,
            mode: r.mode,
            rounds: r.rounds,
            proposed_by: r.proposed_by,
            consensus: r.consensus_reached,
            ci_status: r.ci_status,
            duration_ms: r.duration_ms,
            started_at: r.started_at
          }))
        };
      } catch (err) {
        console.error('[eval-store] getReport failed:', err.message);
        return { total: 0, error: err.message };
      }
    },

    /**
     * Get last N runs.
     */
    getLastRuns(limit = 10) {
      try {
        return getLastRunsStmt.all(limit);
      } catch (err) {
        console.error('[eval-store] getLastRuns failed:', err.message);
        return [];
      }
    },

    /**
     * Inject external cache-store for metrics caching.
     * @param {object} cacheStore — createCacheStore() instance
     */
    getConsiliumRuns({ last = 10, project = null } = {}) {
      try {
        return project
          ? getRunsByProjectStmt.all(project, last)
          : getLastRunsStmt.all(last);
      } catch (err) {
        console.error('[eval-store] getConsiliumRuns failed:', err.message);
        return [];
      }
    },

    getConsiliumRunDetail(runId) {
      try {
        const run = getRunStmt.get(runId);
        if (!run) return null;

        return {
          run,
          providerResponses: getProviderResponsesStmt.all(runId),
          roundSummary: getRoundSummaryStmt.all(runId),
          roundResponses: getRoundResponsesStmt.all(runId),
        };
      } catch (err) {
        console.error('[eval-store] getConsiliumRunDetail failed:', err.message);
        return null;
      }
    },

    setCacheStore(cacheStore) {
      _cacheStore = cacheStore;
    },

    /**
     * Get raw provider metrics for adaptive routing.
     * Cached for 60 seconds via cache-store (or local fallback). Fail-safe: returns empty on error.
     * @returns {{ providers: Map<string, object>, globalWinRate: number }}
     */
    getProviderMetrics() {
      const CACHE_KEY = 'metrics:global';
      const TTL = 60_000;
      const now = Date.now();

      // Try cache-store first, then local fallback
      if (_cacheStore) {
        const cached = _cacheStore.get(CACHE_KEY);
        if (cached) {
          cached.providers = new Map(cached._providerEntries || []);
          delete cached._providerEntries;
          return cached;
        }
      } else {
        const local = _localCache.get(CACHE_KEY);
        if (local && (now - local.time) < TTL) return local.value;
      }

      try {
        const rows = providerMetricsRawStmt.all();
        const providers = new Map();
        for (const row of rows) {
          providers.set(row.provider, {
            total_responses: row.total_responses,
            wins: row.wins,
            avg_response_ms: row.avg_response_ms,
            avg_confidence: row.avg_confidence
          });
        }
        applyFeedbackStats(providers, feedbackStatsByProviderStmt.all());
        const global = globalWinRateStmt.get();
        const globalWinRate = global.total_responses > 0
          ? global.total_wins / global.total_responses
          : 0.25;

        const result = { providers, globalWinRate };
        if (_cacheStore) {
          const toCache = { _providerEntries: [...providers], globalWinRate };
          _cacheStore.set(CACHE_KEY, toCache, { ttl: TTL });
        } else {
          _localCache.set(CACHE_KEY, { value: result, time: now });
        }
        return result;
      } catch (err) {
        console.error('[eval-store] getProviderMetrics failed:', err.message);
        return { providers: new Map(), globalWinRate: 0.25 };
      }
    },

    /**
     * Get provider metrics filtered by task_type.
     * Cached per taskType for 60 seconds via cache-store (or local fallback).
     * @param {string} taskType
     * @returns {{ providers: Map<string, object>, globalWinRate: number }}
     */
    getProviderMetricsByTaskType(taskType) {
      const CACHE_KEY = `metrics:tasktype:${taskType}`;
      const TTL = 60_000;
      const now = Date.now();

      if (_cacheStore) {
        const cached = _cacheStore.get(CACHE_KEY);
        if (cached) {
          cached.providers = new Map(cached._providerEntries || []);
          delete cached._providerEntries;
          return cached;
        }
      } else {
        const local = _localCache.get(CACHE_KEY);
        if (local && (now - local.time) < TTL) return local.value;
      }

      try {
        const rows = providerMetricsByTaskTypeStmt.all(taskType);
        const providers = new Map();
        for (const row of rows) {
          providers.set(row.provider, {
            total_responses: row.total_responses,
            wins: row.wins,
            avg_response_ms: row.avg_response_ms,
            avg_confidence: row.avg_confidence
          });
        }
        applyFeedbackStats(providers, feedbackStatsByProviderTaskTypeStmt.all(taskType));
        const global = globalWinRateStmt.get();
        const globalWinRate = global.total_responses > 0
          ? global.total_wins / global.total_responses
          : 0.25;

        const result = { providers, globalWinRate };
        if (_cacheStore) {
          const toCache = { _providerEntries: [...providers], globalWinRate };
          _cacheStore.set(CACHE_KEY, toCache, { ttl: TTL });
        } else {
          _localCache.set(CACHE_KEY, { value: result, time: now });
        }
        return result;
      } catch (err) {
        console.error('[eval-store] getProviderMetricsByTaskType failed:', err.message);
        return { providers: new Map(), globalWinRate: 0.25 };
      }
    },

    /**
     * Get readiness status for adaptive routing auto-enable.
     * @returns {{ totalRuns: number, isReady: boolean, alpha: number, adaptiveEnabled: boolean }}
     */
    getReadiness() {
      try {
        const { total } = countCompletedRunsStmt.get();
        const isReady = total >= 50;
        const alpha = Math.min(0.35, (total / 100) * 0.35);
        const envForced = process.env.CTX_ADAPTIVE_ROUTING === '0';
        return {
          totalRuns: total,
          isReady,
          alpha,
          adaptiveEnabled: isReady && !envForced
        };
      } catch (err) {
        console.error('[eval-store] getReadiness failed:', err.message);
        return { totalRuns: 0, isReady: false, alpha: 0, adaptiveEnabled: false };
      }
    },

    /**
     * Insert a single routing decision.
     */
    insertRoutingDecision(record) {
      try {
        insertRoutingDecisionStmt.run(
          record.timestamp, record.task_snippet, record.task_type,
          record.selected_provider, record.runner_up ?? null,
          record.final_score, record.static_component, record.eval_component,
          record.feedback_component ?? 0, record.explore_component, record.alpha, record.delta ?? null,
          record.is_diverged ?? 0, record.routing_mode
        );
      } catch (err) {
        console.error('[eval-store] insertRoutingDecision failed:', err.message);
      }
    },

    /**
     * Insert a batch of routing decisions in a transaction.
     */
    insertRoutingDecisionBatch(records) {
      if (!records || records.length === 0) return;
      try {
        db.exec('BEGIN');
        for (const r of records) {
          insertRoutingDecisionStmt.run(
            r.timestamp, r.task_snippet, r.task_type,
            r.selected_provider, r.runner_up ?? null,
            r.final_score, r.static_component, r.eval_component,
            r.feedback_component ?? 0, r.explore_component, r.alpha, r.delta ?? null,
            r.is_diverged ?? 0, r.routing_mode
          );
        }
        db.exec('COMMIT');
      } catch (err) {
        try { db.exec('ROLLBACK'); } catch { /* ignore */ }
        console.error('[eval-store] insertRoutingDecisionBatch failed:', err.message);
      }
    },

    /**
     * Get routing health data for observability.
     * @param {{ last?: number, sinceDays?: number }} opts
     * @returns {{ total: number, decisions: Array, distribution: Array, anomalyStats: object }}
     */
    getRoutingHealth({ last = 20, sinceDays = 1 } = {}) {
      try {
        const total = countRoutingDecisionsStmt.get()?.total || 0;
        const decisions = getLastRoutingDecisionsStmt.all(last);
        const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
        const distribution = routingProviderDistStmt.all(since);
        const anomalyStats = routingAnomalyStatsStmt.get(since) || {};
        return { total, decisions, distribution, anomalyStats };
      } catch (err) {
        console.error('[eval-store] getRoutingHealth failed:', err.message);
        return { total: 0, decisions: [], distribution: [], anomalyStats: {} };
      }
    },

    /**
     * Persist operator feedback for a routing decision.
     * One record per { decision, actor } to keep the contract idempotent for dashboard UX.
     */
    addRoutingFeedback({
      decision_id,
      selected_provider = null,
      task_type = null,
      verdict,
      note = null,
      actor = 'dashboard',
      timestamp = new Date().toISOString()
    }) {
      try {
        const decision = getRoutingDecisionByIdStmt.get(decision_id);
        if (!decision) {
          return { ok: false, error: `Routing decision "${decision_id}" not found` };
        }

        const provider = selected_provider || decision.selected_provider;
        const taskType = task_type || decision.task_type;
        upsertRoutingFeedbackStmt.run(
          decision_id,
          timestamp,
          provider,
          taskType,
          verdict,
          note ?? null,
          actor
        );
        invalidateMetricsCache(taskType);

        const row = getRoutingFeedbackByDecisionActorStmt.get(decision_id, actor);
        if (!row) {
          return { ok: false, error: 'Feedback persisted but could not be reloaded' };
        }

        return {
          ok: true,
          record: {
            id: row.id,
            decision_id: row.decision_id,
            selected_provider: row.selected_provider,
            task_type: row.task_type,
            verdict: row.verdict,
            note: row.note ?? null,
            actor: row.actor,
            timestamp: row.timestamp
          }
        };
      } catch (err) {
        console.error('[eval-store] addRoutingFeedback failed:', err.message);
        return { ok: false, error: err.message };
      }
    },

    /**
     * Aggregate routing feedback for explainability and adaptive weighting.
     */
    getRoutingFeedbackSummary({ sinceDays = 7, decisionIds = [] } = {}) {
      try {
        const since = new Date(Date.now() - sinceDays * 86400000).toISOString();
        const rows = getRecentRoutingFeedbackStmt.all(since);
        const decisionSet = new Set((decisionIds || []).filter((value) => Number.isInteger(value)));
        const byProvider = new Map();
        const byDecision = new Map();
        const summary = { total: 0, positive: 0, neutral: 0, negative: 0 };

        for (const row of rows) {
          summary.total++;
          summary[row.verdict] = (summary[row.verdict] || 0) + 1;

          let providerEntry = byProvider.get(row.selected_provider);
          if (!providerEntry) {
            providerEntry = {
              provider: row.selected_provider,
              total: 0,
              positive: 0,
              neutral: 0,
              negative: 0,
              score: 0.5
            };
            byProvider.set(row.selected_provider, providerEntry);
          }
          providerEntry.total++;
          providerEntry[row.verdict]++;
          providerEntry.score = (providerEntry.positive + providerEntry.neutral * 0.5) / providerEntry.total;

          if (decisionSet.size > 0 && !decisionSet.has(row.decision_id)) continue;

          let decisionEntry = byDecision.get(row.decision_id);
          if (!decisionEntry) {
            decisionEntry = {
              verdict: 'unrated',
              total: 0,
              positive: 0,
              neutral: 0,
              negative: 0,
              note: null,
              lastSubmittedAt: null,
            };
            byDecision.set(row.decision_id, decisionEntry);
          }

          decisionEntry.total++;
          decisionEntry[row.verdict]++;
          decisionEntry.verdict = row.verdict;
          decisionEntry.note = row.note ?? null;
          decisionEntry.lastSubmittedAt = row.timestamp;
        }

        return {
          ...summary,
          byProvider: [...byProvider.values()].sort((a, b) => b.total - a.total || a.provider.localeCompare(b.provider)),
          byDecision: Object.fromEntries(byDecision.entries()),
        };
      } catch (err) {
        console.error('[eval-store] getRoutingFeedbackSummary failed:', err.message);
        return {
          total: 0,
          positive: 0,
          neutral: 0,
          negative: 0,
          byProvider: [],
          byDecision: {},
        };
      }
    },

    /**
     * Delete routing decisions older than N days.
     * @param {number} olderThanDays
     */
    cleanupOldRoutingDecisions(olderThanDays = 7) {
      try {
        const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString();
        deleteOldRoutingStmt.run(cutoff);
      } catch (err) {
        console.error('[eval-store] cleanupOldRoutingDecisions failed:', err.message);
      }
    },

    /**
     * Record a provider's response for a specific round.
     */
    addRoundResponse(runId, { round, provider, alias, status = 'completed', response_ms = null, response_text = null, confidence = null, position_changed = 0 }) {
      try {
        insertRoundResponseStmt.run(
          runId, round, provider, alias ?? null, status,
          response_ms, response_text, confidence, position_changed
        );
      } catch (err) {
        console.error('[eval-store] addRoundResponse failed:', err.message);
      }
    },

    /**
     * Get all round responses for a run.
     */
    getRoundResponses(runId) {
      try {
        return getRoundResponsesStmt.all(runId);
      } catch (err) {
        console.error('[eval-store] getRoundResponses failed:', err.message);
        return [];
      }
    },

    /**
     * Get round-by-round summary for a run.
     */
    getRoundSummary(runId) {
      try {
        return getRoundSummaryStmt.all(runId);
      } catch (err) {
        console.error('[eval-store] getRoundSummary failed:', err.message);
        return [];
      }
    },

    /**
     * Close database connection.
     */
    close() {
      if (db && typeof db.close === 'function') {
        db.close();
      }
    }
  };

  // Non-critical cleanup on init
  try { store.cleanupOldRoutingDecisions(7); } catch { /* ignore */ }

  return store;
}
