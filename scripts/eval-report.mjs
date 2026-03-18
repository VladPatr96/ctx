#!/usr/bin/env node

/**
 * eval-report.mjs — CLI for viewing consilium evaluation statistics.
 *
 * Usage:
 *   node scripts/eval-report.mjs               # общий отчёт
 *   node scripts/eval-report.mjs --last 10     # последние 10
 *   node scripts/eval-report.mjs --project ctx # по проекту
 */

import { join } from 'node:path';
import { createEvalStore } from '../src/evaluation/eval-store.js';

const args = process.argv.slice(2);

function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  if (idx === -1 || idx + 1 >= args.length) return null;
  return args[idx + 1];
}

const project = getArg('project');
const last = parseInt(getArg('last') || '50', 10);
const dataDir = process.env.CTX_DATA_DIR || join(process.cwd(), '.data');

let store;
try {
  store = createEvalStore(dataDir);
} catch (err) {
  console.error('Failed to open eval store:', err.message);
  process.exit(1);
}

const report = store.getReport({ project, last });

console.log('');
console.log('=== Evaluation Report ===');
console.log('');

if (project) {
  console.log(`Project: ${project}`);
}

console.log(`Total consiliums: ${report.total}`);

if (report.total === 0) {
  console.log('No consilium runs recorded yet.');
  store.close();
  process.exit(0);
}

console.log('');
console.log('--- Rounds ---');
console.log(`  Average: ${report.rounds.avg ? Number(report.rounds.avg).toFixed(1) : 'N/A'}`);
console.log(`  Min:     ${report.rounds.min || 'N/A'}`);
console.log(`  Max:     ${report.rounds.max || 'N/A'}`);

console.log('');
console.log(`Consensus rate: ${report.consensus_rate}`);

if (report.providers.length > 0) {
  console.log('');
  console.log('--- Provider Stats ---');
  console.log(
    '  ' +
    'Provider'.padEnd(12) +
    'Responses'.padEnd(12) +
    'Wins'.padEnd(8) +
    'Win Rate'.padEnd(12) +
    'Avg ms'.padEnd(10) +
    'Avg Conf'
  );
  for (const p of report.providers) {
    console.log(
      '  ' +
      p.provider.padEnd(12) +
      String(p.responses).padEnd(12) +
      String(p.wins).padEnd(8) +
      p.win_rate.padEnd(12) +
      (p.avg_response_ms != null ? String(p.avg_response_ms) : '-').padEnd(10) +
      (p.avg_confidence != null ? String(p.avg_confidence) : '-')
    );
  }
}

if (Object.keys(report.ci || {}).length > 0) {
  console.log('');
  console.log('--- CI Status ---');
  for (const [status, count] of Object.entries(report.ci)) {
    console.log(`  ${status}: ${count}`);
  }
}

if (report.recent_runs && report.recent_runs.length > 0) {
  console.log('');
  console.log(`--- Recent Runs (last ${Math.min(last, report.recent_runs.length)}) ---`);
  for (const r of report.recent_runs.slice(0, 10)) {
    const consensus = r.consensus ? 'YES' : 'NO';
    const ci = r.ci_status || '-';
    console.log(
      `  [${r.started_at}] ${r.topic.substring(0, 40).padEnd(42)} ` +
      `by:${(r.proposed_by || '-').padEnd(10)} consensus:${consensus} ci:${ci}`
    );
  }
  if (report.recent_runs.length > 10) {
    console.log(`  ... and ${report.recent_runs.length - 10} more`);
  }
}

console.log('');

store.close();
