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

  // ---- Prepared statements ----

  const insertRunStmt = db.prepare(`
    INSERT INTO consilium_runs(run_id, project, topic, mode, providers_invoked, started_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertProviderStmt = db.prepare(`
    INSERT INTO provider_responses(run_id, provider, model, status, response_ms, confidence, key_idea, error_message)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
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

  let _metricsCache = null;
  let _metricsCacheTime = 0;

  const ciStatsStmt = db.prepare(`
    SELECT ci_status, COUNT(*) as cnt
    FROM consilium_runs
    WHERE ci_status IS NOT NULL
    GROUP BY ci_status
  `);

  const respondedProvidersStmt = db.prepare(`
    SELECT DISTINCT provider FROM provider_responses WHERE run_id = ?
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
      error_message = null
    }) {
      try {
        insertProviderStmt.run(
          runId, provider, model, status,
          response_ms, confidence, key_idea, error_message
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
     * Get raw provider metrics for adaptive routing.
     * Cached for 60 seconds. Fail-safe: returns empty on error.
     * @returns {{ providers: Map<string, object>, globalWinRate: number }}
     */
    getProviderMetrics() {
      const now = Date.now();
      if (_metricsCache && (now - _metricsCacheTime) < 60_000) {
        return _metricsCache;
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
        const global = globalWinRateStmt.get();
        const globalWinRate = global.total_responses > 0
          ? global.total_wins / global.total_responses
          : 0.25;

        _metricsCache = { providers, globalWinRate };
        _metricsCacheTime = now;
        return _metricsCache;
      } catch (err) {
        console.error('[eval-store] getProviderMetrics failed:', err.message);
        return { providers: new Map(), globalWinRate: 0.25 };
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

  return store;
}
