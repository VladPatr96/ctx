import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { extractSections, saveSessionContext } from '../src/knowledge/session-save.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

function createMemoryStore(overrides = {}) {
  const calls = {
    entries: [],
    snapshots: [],
    closed: 0,
  };

  return {
    store: {
      saveEntry(entry) {
        calls.entries.push(entry);
        if (typeof overrides.onSaveEntry === 'function') {
          return overrides.onSaveEntry(entry);
        }
        return { saved: true };
      },
      saveSnapshot(project, snapshot) {
        calls.snapshots.push({ project, snapshot });
        if (typeof overrides.onSaveSnapshot === 'function') {
          return overrides.onSaveSnapshot(project, snapshot);
        }
      },
      close() {
        calls.closed++;
      },
    },
    calls,
  };
}

test('extractSections normalizes CRLF session logs and returns named sections', () => {
  const sections = extractSections(
    [
      '## Actions',
      'Did work',
      '',
      '## Errors & Solutions',
      'Fixed issue',
      '',
      '## Decisions',
      'Use local fallback',
      '',
      '## Summary',
      'Done',
      '',
    ].join('\r\n')
  );

  assert.equal(sections.actions, 'Did work');
  assert.equal(sections.errors_solutions, 'Fixed issue');
  assert.equal(sections.decisions, 'Use local fallback');
  assert.equal(sections.summary, 'Done');
});

test('saveSessionContext routes project and lesson issues and syncs KB on successful save', async () => {
  const runtime = createMemoryStore();
  const issues = [];
  let syncCalls = 0;

  const result = await saveSessionContext(
    {
      event: 'compact',
      now: '2026-03-11T10:30:00.000Z',
    },
    {
      getProjectName: () => 'claude_ctx',
      getProjectRepo: () => 'owner/repo',
      getGitContext: () => ({ branch: 'main', status: 'M README.md', log: 'abc123 init' }),
      getLatestSessionLog: () => [
        '## Actions',
        'Implemented session persistence tests',
        '',
        '## Errors & Solutions',
        'Handled readonly sqlite fallback',
        '',
        '## Decisions',
        'Keep GitHub as external memory source of truth',
        '',
      ].join('\n'),
      getCentralRepo: () => 'central/repo',
      loadKnowledgeStore: async () => ({ store: runtime.store, mode: 'sqlite' }),
      createIssue: (repo, title, body, labels) => {
        issues.push({ repo, title, body, labels });
        return `https://example.test/${repo}/${issues.length}`;
      },
      syncKB: async () => {
        syncCalls++;
        return { status: 'pushed' };
      },
      log: () => {},
      warn: () => {},
    }
  );

  assert.equal(result.kbSaved, true);
  assert.equal(result.syncStatus, 'pushed');
  assert.equal(runtime.calls.entries.length, 3);
  assert.deepEqual(
    runtime.calls.entries.map((entry) => entry.category),
    ['error', 'decision', 'session-summary']
  );
  assert.equal(runtime.calls.snapshots.length, 1);
  assert.equal(runtime.calls.snapshots[0].snapshot.branch, 'main');
  assert.equal(runtime.calls.snapshots[0].snapshot.date, '2026-03-11T10:30:00.000Z');
  assert.equal(runtime.calls.closed, 1);
  assert.equal(syncCalls, 1);
  assert.equal(issues.length, 2);
  assert.equal(issues[0].repo, 'owner/repo');
  assert.equal(issues[0].title, 'Session: 2026-03-11 — compact');
  assert.deepEqual(issues[0].labels, ['session', 'provider:claude-code']);
  assert.match(issues[0].body, /Implemented session persistence tests/);
  assert.equal(issues[1].repo, 'central/repo');
  assert.deepEqual(issues[1].labels, ['lesson', 'project:claude_ctx']);
  assert.match(issues[1].body, /Handled readonly sqlite fallback/);
});

test('saveSessionContext retries readonly sqlite KB with local JSON fallback', async () => {
  const primary = createMemoryStore({
    onSaveEntry() {
      throw new Error('readonly database');
    },
  });
  const fallback = createMemoryStore();
  const warnings = [];
  let fallbackLoads = 0;
  let syncCalls = 0;

  const result = await saveSessionContext(
    {
      event: 'stop',
      now: '2026-03-11T11:00:00.000Z',
    },
    {
      getProjectName: () => 'claude_ctx',
      getProjectRepo: () => null,
      getGitContext: () => ({ branch: 'main', status: '', log: '' }),
      getLatestSessionLog: () => [
        '## Decisions',
        'Retry with JSON fallback',
        '',
      ].join('\n'),
      getCentralRepo: () => 'central/repo',
      loadKnowledgeStore: async () => ({ store: primary.store, mode: 'sqlite' }),
      loadLocalJsonStore: async () => {
        fallbackLoads++;
        return { store: fallback.store, mode: 'json-local' };
      },
      createIssue: () => null,
      syncKB: async () => {
        syncCalls++;
        return { status: 'pushed' };
      },
      log: () => {},
      warn: (message) => warnings.push(message),
    }
  );

  assert.equal(result.kbSaved, true);
  assert.equal(result.kbMode, 'json-local');
  assert.equal(primary.calls.closed, 1);
  assert.equal(fallback.calls.closed, 1);
  assert.equal(fallbackLoads, 1);
  assert.equal(fallback.calls.entries.length, 1);
  assert.deepEqual(
    fallback.calls.entries.map((entry) => entry.category),
    ['decision']
  );
  assert.equal(syncCalls, 1);
  assert.ok(warnings.some((message) => message.includes('read-only')));
});

test('saveSessionContext skips remote issue creation and KB sync when nothing is available', async () => {
  const result = await saveSessionContext(
    { event: 'stop', now: '2026-03-11T11:15:00.000Z' },
    {
      getProjectName: () => 'claude_ctx',
      getProjectRepo: () => null,
      getGitContext: () => ({ branch: '', status: '', log: '' }),
      getLatestSessionLog: () => null,
      getCentralRepo: () => 'central/repo',
      loadKnowledgeStore: async () => null,
      createIssue: () => {
        throw new Error('createIssue should not be called');
      },
      syncKB: async () => {
        throw new Error('syncKB should not be called');
      },
      log: () => {},
      warn: () => {},
    }
  );

  assert.equal(result.kbSaved, false);
  assert.equal(result.syncStatus, null);
  assert.equal(result.issueUrls.project, null);
  assert.equal(result.issueUrls.lesson, null);
});

test('ctx-session-save CLI help path remains executable through the script entrypoint', () => {
  const sandbox = mkdtempSync(join(tmpdir(), 'ctx-session-save-'));

  try {
    const result = spawnSync(
      process.execPath,
      ['scripts/ctx-session-save.js', '--help'],
      {
        cwd: ROOT_DIR,
        encoding: 'utf-8',
        shell: false,
        env: {
          ...process.env,
          CTX_KB_DISABLED: '1',
          CLAUDE_PROJECT_DIR: sandbox,
        },
      }
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: node scripts\/ctx-session-save\.js --event <compact\|stop>/);
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
});
