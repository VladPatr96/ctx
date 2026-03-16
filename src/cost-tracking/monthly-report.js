/**
 * Monthly Cost Report Generator
 *
 * Generates a comprehensive HTML report of API costs for the last 30 days.
 * Includes breakdowns by provider, project, model, and daily trends.
 *
 * Usage: node scripts/cost-tracking/monthly-report.js
 */

import { existsSync } from 'node:fs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createCostStore } from './cost-store.js';

// ---- Date Utilities ----

function formatDate(isoDate) {
  const d = new Date(isoDate);
  return d.toISOString().split('T')[0];
}

function getDaysAgo(days) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.getTime();
}

function getDateKey(timestamp) {
  const d = new Date(timestamp);
  return d.toISOString().split('T')[0];
}

// ---- Chart Utilities ----

function makeBar(value, maxVal, width = 40) {
  const filled = Math.floor((value / maxVal) * width);
  return '\u2588'.repeat(Math.max(0, filled));
}

function formatCost(cost) {
  if (cost < 0.01) return `$${cost.toFixed(4)}`;
  if (cost < 1) return `$${cost.toFixed(3)}`;
  return `$${cost.toFixed(2)}`;
}

function formatNumber(num) {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return String(num);
}

// ---- Data Processing ----

function processMonthlyData(costStore, days = 30) {
  const data = costStore.readCostData();
  const cutoffTime = getDaysAgo(days);

  // Filter requests from the last N days
  const recentRequests = (data.requests || []).filter(req => {
    const timestamp = new Date(req.timestamp).getTime();
    return timestamp >= cutoffTime;
  });

  if (recentRequests.length === 0) {
    return null;
  }

  // Calculate totals
  const totalCost = recentRequests.reduce((sum, req) => sum + (req.cost || 0), 0);
  const totalTokens = recentRequests.reduce((sum, req) => sum + (req.totalTokens || 0), 0);
  const totalRequests = recentRequests.length;

  // By provider
  const byProvider = {};
  for (const req of recentRequests) {
    const provider = req.provider || 'unknown';
    if (!byProvider[provider]) {
      byProvider[provider] = {
        cost: 0,
        requests: 0,
        tokens: 0,
        models: {}
      };
    }
    byProvider[provider].cost += req.cost || 0;
    byProvider[provider].requests += 1;
    byProvider[provider].tokens += req.totalTokens || 0;

    const model = req.model || 'unknown';
    if (!byProvider[provider].models[model]) {
      byProvider[provider].models[model] = { cost: 0, requests: 0, tokens: 0 };
    }
    byProvider[provider].models[model].cost += req.cost || 0;
    byProvider[provider].models[model].requests += 1;
    byProvider[provider].models[model].tokens += req.totalTokens || 0;
  }

  // By project
  const byProject = {};
  for (const req of recentRequests) {
    if (!req.projectId) continue;
    if (!byProject[req.projectId]) {
      byProject[req.projectId] = { cost: 0, requests: 0, tokens: 0 };
    }
    byProject[req.projectId].cost += req.cost || 0;
    byProject[req.projectId].requests += 1;
    byProject[req.projectId].tokens += req.totalTokens || 0;
  }

  // Daily breakdown
  const byDay = {};
  for (const req of recentRequests) {
    const dayKey = getDateKey(req.timestamp);
    if (!byDay[dayKey]) {
      byDay[dayKey] = { cost: 0, requests: 0, tokens: 0 };
    }
    byDay[dayKey].cost += req.cost || 0;
    byDay[dayKey].requests += 1;
    byDay[dayKey].tokens += req.totalTokens || 0;
  }

  // Sort providers by cost
  const providersList = Object.entries(byProvider)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.cost - a.cost);

  // Sort projects by cost
  const projectsList = Object.entries(byProject)
    .map(([name, stats]) => ({ name, ...stats }))
    .sort((a, b) => b.cost - a.cost);

  // Get top models across all providers
  const allModels = [];
  for (const provider of providersList) {
    for (const [modelName, modelStats] of Object.entries(provider.models)) {
      allModels.push({
        provider: provider.name,
        model: modelName,
        ...modelStats
      });
    }
  }
  allModels.sort((a, b) => b.cost - a.cost);
  const topModels = allModels.slice(0, 10);

  // Sort daily data
  const dailyList = Object.entries(byDay)
    .map(([date, stats]) => ({ date, ...stats }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    totalCost,
    totalTokens,
    totalRequests,
    providersList,
    projectsList,
    topModels,
    dailyList,
    dateRange: {
      start: dailyList[0]?.date || '',
      end: dailyList[dailyList.length - 1]?.date || ''
    }
  };
}

// ---- HTML Generation ----

function generateHTML(stats, days) {
  const maxProviderCost = stats.providersList[0]?.cost || 1;
  const maxDailyCost = Math.max(...stats.dailyList.map(d => d.cost), 1);

  // Provider rows
  let providerRows = '';
  for (let i = 0; i < stats.providersList.length; i++) {
    const p = stats.providersList[i];
    const percent = ((p.cost / stats.totalCost) * 100).toFixed(1);
    providerRows += `<div class="row">
  <span class="dim">${i + 1}.</span>
  <span class="bright">${p.name}</span>
  <span class="cyan">${formatCost(p.cost)}</span>
  <span class="dim">${percent}%</span>
  <span class="orange">${formatNumber(p.tokens)}</span>
  <span class="dim">${p.requests}</span>
</div>
`;
  }

  // Provider chart
  let providerChart = '';
  for (const p of stats.providersList) {
    const bar = makeBar(p.cost, maxProviderCost);
    providerChart += `<div><span class="dim" style="display:inline-block;width:120px">${p.name}</span> <span class="cyan">${bar}</span> <span class="bright">${formatCost(p.cost)}</span></div>\n`;
  }

  // Top models
  let modelsRows = '';
  for (let i = 0; i < Math.min(10, stats.topModels.length); i++) {
    const m = stats.topModels[i];
    modelsRows += `<div class="row">
  <span class="dim">${i + 1}.</span>
  <span class="bright">${m.model}</span>
  <span class="dim">${m.provider}</span>
  <span class="cyan">${formatCost(m.cost)}</span>
  <span class="orange">${formatNumber(m.tokens)}</span>
  <span class="dim">${m.requests}</span>
</div>
`;
  }

  // Projects (if any)
  let projectsSection = '';
  if (stats.projectsList.length > 0) {
    let projectRows = '';
    for (let i = 0; i < Math.min(10, stats.projectsList.length); i++) {
      const p = stats.projectsList[i];
      const percent = ((p.cost / stats.totalCost) * 100).toFixed(1);
      const displayName = p.name.split(/[/\\]/).pop() || p.name;
      projectRows += `<div class="row">
  <span class="dim">${i + 1}.</span>
  <span class="bright">${displayName}</span>
  <span class="cyan">${formatCost(p.cost)}</span>
  <span class="dim">${percent}%</span>
  <span class="orange">${formatNumber(p.tokens)}</span>
  <span class="dim">${p.requests}</span>
</div>
`;
    }

    projectsSection = `
    <div class="section">
      <div class="section-header">$ cost-report --by-project</div>
      <div class="row" style="border-bottom: 1px solid #333;">
        <span class="dim">#</span>
        <span class="dim">PROJECT</span>
        <span class="dim">COST</span>
        <span class="dim">%</span>
        <span class="dim">TOKENS</span>
        <span class="dim">REQS</span>
      </div>
      ${projectRows}
    </div>`;
  }

  // Daily trend chart
  let dailyChart = '';
  for (const d of stats.dailyList) {
    const bar = makeBar(d.cost, maxDailyCost, 50);
    dailyChart += `<div><span class="dim" style="display:inline-block;width:100px">${d.date}</span> <span class="cyan">${bar}</span> <span class="bright">${formatCost(d.cost)}</span> <span class="dim">${d.requests} req</span></div>\n`;
  }

  const avgDailyCost = stats.totalCost / stats.dailyList.length;
  const avgDailyReqs = stats.totalRequests / stats.dailyList.length;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Monthly Cost Report</title>
  <style>
    body {
      font-family: 'Cascadia Code', 'Consolas', 'Courier New', monospace;
      background: #0d0d0d;
      color: #b0b0b0;
      font-size: 14px;
      line-height: 1.6;
      padding: 24px;
    }
    .container { max-width: 1000px; margin: 0 auto; }
    .header { color: #6a9955; margin-bottom: 24px; }
    .dim { color: #555; }
    .bright { color: #e0e0e0; }
    .cyan { color: #4ec9b0; }
    .orange { color: #ce9178; }
    .row {
      display: grid;
      grid-template-columns: 24px 200px 120px 80px 100px 80px;
      gap: 8px;
      padding: 6px 0;
      border-bottom: 1px solid #1a1a1a;
    }
    .row:hover { background: #141414; }
    .stat-box { display: inline-block; margin-right: 32px; margin-bottom: 16px; }
    .stat-value { font-size: 28px; color: #e0e0e0; }
    .stat-label { color: #555; font-size: 12px; }
    .section { margin: 32px 0; }
    .section-header { color: #555; margin-bottom: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <pre class="header">
┌──────────────────────────────────────────────────────────────────────┐
│   ████████╗ ██████╗ ███████╗████████╗                               │
│   ██╔════╝██╔═══██╗██╔════╝╚══██╔══╝                               │
│   ██║     ██║   ██║███████╗   ██║                                   │
│   ██║     ██║   ██║╚════██║   ██║                                   │
│   ╚██████╗╚██████╔╝███████║   ██║                                   │
│    ╚═════╝ ╚═════╝ ╚══════╝   ╚═╝                                   │
│   Monthly Cost Report — Last ${days} Days                              │
│   ${stats.dateRange.start} .. ${stats.dateRange.end}                                     │
└──────────────────────────────────────────────────────────────────────┘
</pre>

    <div class="section">
      <div class="stat-box"><div class="stat-value">${formatCost(stats.totalCost)}</div><div class="stat-label">TOTAL COST</div></div>
      <div class="stat-box"><div class="stat-value">${formatNumber(stats.totalRequests)}</div><div class="stat-label">REQUESTS</div></div>
      <div class="stat-box"><div class="stat-value">${formatNumber(stats.totalTokens)}</div><div class="stat-label">TOKENS</div></div>
      <div class="stat-box"><div class="stat-value">${stats.providersList.length}</div><div class="stat-label">PROVIDERS</div></div>
      <div class="stat-box"><div class="stat-value">${formatCost(avgDailyCost)}</div><div class="stat-label">AVG/DAY</div></div>
      <div class="stat-box"><div class="stat-value">${Math.round(avgDailyReqs)}</div><div class="stat-label">REQ/DAY</div></div>
    </div>

    <div class="section">
      <div class="section-header">$ cost-report --by-provider</div>
      <div class="row" style="border-bottom: 1px solid #333;">
        <span class="dim">#</span>
        <span class="dim">PROVIDER</span>
        <span class="dim">COST</span>
        <span class="dim">%</span>
        <span class="dim">TOKENS</span>
        <span class="dim">REQS</span>
      </div>
      ${providerRows}
    </div>

    <div class="section">
      <div class="section-header">$ cost-report --chart provider</div>
      ${providerChart}
    </div>

    <div class="section">
      <div class="section-header">$ cost-report --top-models</div>
      <div class="row" style="border-bottom: 1px solid #333;">
        <span class="dim">#</span>
        <span class="dim">MODEL</span>
        <span class="dim">PROVIDER</span>
        <span class="dim">COST</span>
        <span class="dim">TOKENS</span>
        <span class="dim">REQS</span>
      </div>
      ${modelsRows}
    </div>

    ${projectsSection}

    <div class="section">
      <div class="section-header">$ cost-report --daily-trend</div>
      ${dailyChart}
    </div>

    <div class="section" style="margin-top: 48px; padding-top: 24px; border-top: 1px solid #333;">
      <div class="dim" style="text-align: center;">
        Generated ${new Date().toISOString().split('T')[0]} • ctx-plugin cost tracking
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ---- Main ----

function main() {
  const costStore = createCostStore({ dataDir: '.data' });
  const dataFile = join('.data', 'cost-tracking.json');

  if (!existsSync(dataFile)) {
    process.stderr.write('⚠️  No cost tracking data found at .data/cost-tracking.json\n');
    process.stderr.write('Generate some sample data first or use the cost tracking system.\n');
    process.exit(1);
  }

  const days = 30;
  const stats = processMonthlyData(costStore, days);

  if (!stats) {
    process.stderr.write(`⚠️  No cost data found for the last ${days} days\n`);
    process.exit(1);
  }

  const html = generateHTML(stats, days);

  // Save to home directory
  const outputPath = join(homedir(), 'cost-report.html');
  writeFileSync(outputPath, html, 'utf-8');

  process.stdout.write(`\n✓ Monthly cost report generated\n`);
  process.stdout.write(`  Report saved to: ${outputPath}\n\n`);
  process.stdout.write(`Summary:\n`);
  process.stdout.write(`  Total Cost:     ${formatCost(stats.totalCost)}\n`);
  process.stdout.write(`  Total Requests: ${stats.totalRequests}\n`);
  process.stdout.write(`  Total Tokens:   ${formatNumber(stats.totalTokens)}\n`);
  process.stdout.write(`  Providers:      ${stats.providersList.length}\n`);
  process.stdout.write(`  Date Range:     ${stats.dateRange.start} to ${stats.dateRange.end}\n\n`);

  if (stats.providersList.length > 0) {
    process.stdout.write(`Top Providers:\n`);
    for (let i = 0; i < Math.min(3, stats.providersList.length); i++) {
      const p = stats.providersList[i];
      const percent = ((p.cost / stats.totalCost) * 100).toFixed(1);
      process.stdout.write(`  ${i + 1}. ${p.name}: ${formatCost(p.cost)} (${percent}%)\n`);
    }
  }

  process.stdout.write(`\nOpen ${outputPath} in your browser to view the full report.\n`);
}

main();
