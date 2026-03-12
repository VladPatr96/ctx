import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { buildAnalyticsSummary } from '../scripts/analytics/summary.js';
import { getDashboardHttpPath } from '../scripts/contracts/dashboard-surface.js';

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

test('buildAnalyticsSummary normalizes provider cost, budget, recommendations, and routing snapshot', async () => {
  const dataDir = mkdtempSync(join(tmpdir(), 'ctx-analytics-summary-'));
  mkdirSync(dataDir, { recursive: true });

  writeJson(join(dataDir, 'cost-tracking.json'), {
    requests: [
      {
        timestamp: '2026-03-09T10:00:00.000Z',
        provider: 'claude',
        model: 'opus-4.6',
        cost: 0.45,
        inputTokens: 800,
        outputTokens: 200,
        totalTokens: 1000,
      },
      {
        timestamp: '2026-03-10T11:00:00.000Z',
        provider: 'claude',
        model: 'opus-4.6',
        cost: 0.55,
        inputTokens: 1200,
        outputTokens: 300,
        totalTokens: 1500,
      },
      {
        timestamp: '2026-03-11T12:00:00.000Z',
        provider: 'gemini',
        model: 'gemini-2.0-flash-exp',
        cost: 0.08,
        inputTokens: 700,
        outputTokens: 100,
        totalTokens: 800,
      },
      {
        timestamp: '2026-03-11T12:30:00.000Z',
        provider: 'gemini',
        model: 'gemini-2.0-flash-exp',
        cost: 0.09,
        inputTokens: 900,
        outputTokens: 120,
        totalTokens: 1020,
      },
      {
        timestamp: '2026-03-11T13:00:00.000Z',
        provider: 'gemini',
        model: 'gemini-2.0-flash-exp',
        cost: 0.07,
        inputTokens: 650,
        outputTokens: 90,
        totalTokens: 740,
      },
      {
        timestamp: '2026-03-11T13:20:00.000Z',
        provider: 'gemini',
        model: 'gemini-2.0-flash-exp',
        cost: 0.1,
        inputTokens: 1000,
        outputTokens: 100,
        totalTokens: 1100,
      },
      {
        timestamp: '2026-03-11T13:45:00.000Z',
        provider: 'gemini',
        model: 'gemini-2.0-flash-exp',
        cost: 0.11,
        inputTokens: 1100,
        outputTokens: 120,
        totalTokens: 1220,
      }
    ],
    sessions: {},
    projects: {},
    metadata: {
      createdAt: '2026-03-09T10:00:00.000Z',
      updatedAt: '2026-03-11T13:45:00.000Z',
    }
  });

  writeJson(join(dataDir, 'budget-config.json'), {
    global: 2,
    providers: {
      claude: 1,
      gemini: 0.75,
    },
    sessions: {},
    projects: {},
    thresholds: {
      warning: 0.8,
      critical: 0.95,
    }
  });

  writeJson(join(dataDir, 'provider-health.json'), {
    claude: {
      calls: 10,
      successRate: 92,
      avgLatencyMs: 350,
    },
    gemini: {
      calls: 12,
      successRate: 96,
      avgLatencyMs: 280,
    }
  });

  const summary = await buildAnalyticsSummary({
    dataDir,
    now: '2026-03-11T15:00:00.000Z',
    evalStore: {
      getRoutingHealth() {
        return {
          total: 12,
          decisions: [
            { timestamp: '2026-03-11T14:55:00.000Z' }
          ],
          distribution: [
            { selected_provider: 'claude', cnt: 7 },
            { selected_provider: 'gemini', cnt: 5 }
          ],
          anomalyStats: {
            diverged_count: 2,
            avg_score: 0.71,
            avg_alpha: 0.2,
            avg_explore: 0.05,
          }
        };
      }
    }
  });

  assert.equal(summary.totals.totalRequests, 7);
  assert.equal(summary.totals.totalCost, 1.45);
  assert.equal(summary.totals.totalTokens, 7380);
  assert.equal(summary.totals.providerCount, 2);
  assert.equal(summary.budget.global?.budget, 2);
  assert.equal(summary.budget.providers.length, 2);
  assert.equal(summary.providers[0].provider, 'claude');
  assert.equal(summary.providers[0].budget?.scope, 'provider');
  assert.ok(summary.providers.some((entry) => entry.provider === 'gemini' && entry.quality?.score != null));
  assert.equal(summary.timeline.points.length, 7);
  assert.equal(summary.timeline.points[6].requests, 5);
  assert.equal(summary.routing.available, true);
  assert.equal(summary.routing.totalDecisions, 12);
  assert.equal(summary.routing.dominantProvider, 'claude');
  assert.equal(summary.routing.lastDecisionAt, '2026-03-11T14:55:00.000Z');
});

test('analytics dashboard contract is wired into endpoint manifest and dashboard widgets', () => {
  assert.equal(getDashboardHttpPath('analyticsSummary'), '/api/analytics/summary');

  const costWidgetSource = readFileSync(resolve('ctx-app/src/components/dashboard/CostAnalyticsWidget.tsx'), 'utf8');
  const costDashboardSource = readFileSync(resolve('ctx-app/src/components/cost/CostDashboard.tsx'), 'utf8');

  assert.match(costWidgetSource, /client\.getAnalyticsSummary\(\)/);
  assert.match(costDashboardSource, /client\.getAnalyticsSummary\(\)/);
  assert.doesNotMatch(costWidgetSource, /MOCK_DATA/);
  assert.doesNotMatch(costDashboardSource, /budgetLimit=\{1\.0\}/);
});
