#!/usr/bin/env node

/**
 * kb-bootstrap.js — One-time import from GitHub Issues into KB.
 *
 * Usage: node scripts/knowledge/kb-bootstrap.js [--force]
 *
 * Fetches lessons, solutions, sessions, consilium issues from GitHub
 * and imports them into the local SQLite KB.
 */

import { runCommandSync } from '../core/utils/shell.js';
import { KbSync } from './kb-sync.js';

import { resolveConfig } from '../core/config/resolve-config.js';

const _config = resolveConfig({ detectGh: true });
const GITHUB_OWNER = _config.githubOwner || '';

async function loadStore() {
  try {
    const { KnowledgeStore } = await import('./knowledge-store.js');
    return new KnowledgeStore();
  } catch {
    const { JsonKnowledgeStore } = await import('./kb-json-fallback.js');
    return new JsonKnowledgeStore();
  }
}

function fetchIssues(label, limit = 50) {
  const result = runCommandSync('gh', [
    'search', 'issues', '',
    '--owner', GITHUB_OWNER,
    '--label', label,
    '--json', 'number,title,body,labels,repository,url',
    '--limit', String(limit)
  ], { timeout: 30000 });

  if (!result.success) {
    console.error(`Failed to fetch ${label} issues: ${result.error}`);
    return [];
  }

  try {
    return JSON.parse(result.stdout);
  } catch {
    console.error(`Failed to parse ${label} issues JSON`);
    return [];
  }
}

async function main() {
  const force = process.argv.includes('--force');

  console.log('[kb-bootstrap] Starting...');

  // Ensure KB repo exists
  const sync = new KbSync();
  const repoStatus = await sync.ensureRepo();
  console.log(`[kb-bootstrap] Repo: ${repoStatus.status}`);

  const store = await loadStore();

  if (!force && store.getMeta('bootstrap_done') === 'true') {
    console.log('[kb-bootstrap] Already bootstrapped. Use --force to re-import.');
    store.close();
    return;
  }

  let totalImported = 0;
  let totalSkipped = 0;

  for (const label of ['lesson', 'solution', 'session', 'consilium', 'decision', 'pattern']) {
    console.log(`[kb-bootstrap] Fetching ${label} issues...`);
    const issues = fetchIssues(label);
    if (issues.length === 0) continue;

    const result = store.importFromIssues(issues);
    totalImported += result.imported;
    totalSkipped += result.skipped;
    console.log(`[kb-bootstrap]   ${label}: ${result.imported} imported, ${result.skipped} skipped`);
  }

  store.setMeta('bootstrap_done', 'true');
  store.setMeta('bootstrap_date', new Date().toISOString());

  const stats = store.getStats();
  console.log(`[kb-bootstrap] Done: ${totalImported} imported, ${totalSkipped} skipped`);
  console.log(`[kb-bootstrap] Total entries: ${stats.total}`);
  console.log(`[kb-bootstrap] By category:`, JSON.stringify(stats.byCategory));
  console.log(`[kb-bootstrap] By project:`, JSON.stringify(stats.byProject));

  // Push to remote
  const pushResult = await sync.push('kb: bootstrap import');
  console.log(`[kb-bootstrap] Sync push: ${pushResult.status}`);

  store.close();
}

main().catch(err => {
  console.error('[kb-bootstrap] Error:', err.message);
  process.exit(1);
});
