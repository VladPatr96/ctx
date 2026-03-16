import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  buildProjectHistoryArtifact,
  writeProjectHistoryArtifact,
} from '../src/docs/project-history.js';

test('buildProjectHistoryArtifact exports sessions and ADR decisions into one schema-valid artifact', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-project-history-build-'));
  mkdirSync(join(rootDir, '.sessions'), { recursive: true });
  mkdirSync(join(rootDir, 'docs', 'reference', 'project-memory'), { recursive: true });

  writeFileSync(join(rootDir, '.sessions', '2026-03-11-1135.md'), `# Session 2026-03-11 11:35
**Project:** claude_ctx
**Branch:** master
**Lead:** codex
**Goals:** Export project memory

## Actions
- Implement export generator

## Errors & Solutions

## Decisions
- Use docs reference artifact for deterministic exports
- Keep GitHub issues as live operational memory

## Files Modified
- scripts/docs/project-history.js

## Tasks
- Build docs export

## Summary
History export completed.
`, 'utf8');

  writeFileSync(join(rootDir, 'docs', 'ADR_PHASE0_SQLITE_FIRST.md'), `# ADR: SQLite First
Status: Accepted
Date: 2026-03-10

## Decision
Use SQLite as the migration target for phase 0-1 while keeping JSON as the runtime default until cutover.
`, 'utf8');

  const artifact = buildProjectHistoryArtifact({
    rootDir,
    now: '2026-03-11T12:00:00.000Z',
  });

  assert.equal(artifact.sessions.summary.total, 1);
  assert.equal(artifact.sessions.summary.withDecisions, 1);
  assert.equal(artifact.decisions.summary.total, 3);
  assert.equal(artifact.decisions.summary.bySource.session, 2);
  assert.equal(artifact.decisions.summary.bySource.adr, 1);
  assert.equal(artifact.sessions.entries[0].project, 'claude_ctx');
  assert.equal(artifact.decisions.entries[0].path.startsWith('.sessions/'), true);
});

test('empty Decisions section does not leak the next markdown heading into exported decisions', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-project-history-empty-decisions-'));
  mkdirSync(join(rootDir, '.sessions'), { recursive: true });

  writeFileSync(join(rootDir, '.sessions', '2026-03-11-1200.md'), `# Session 2026-03-11 12:00
**Project:** claude_ctx
**Branch:** master
**Lead:** codex
**Goals:** Validate empty decisions parsing

## Actions
- Review parser behavior

## Errors & Solutions

## Decisions
## Files Modified
- scripts/docs/project-history.js

## Tasks
- Add regression test

## Summary
Parser stays clean.
`, 'utf8');

  const artifact = buildProjectHistoryArtifact({
    rootDir,
    now: '2026-03-11T12:00:00.000Z',
  });

  assert.equal(artifact.sessions.entries[0].decisionsCount, 0);
  assert.equal(artifact.decisions.summary.bySource.session, 0);
});

test('writeProjectHistoryArtifact persists the requested JSON artifact', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-project-history-write-'));
  mkdirSync(join(rootDir, 'docs', 'reference', 'project-memory'), { recursive: true });
  mkdirSync(join(rootDir, 'docs'), { recursive: true });

  writeFileSync(join(rootDir, 'docs', 'ADR_PHASE0_SQLITE_FIRST.md'), `# ADR: SQLite First
Status: Accepted
Date: 2026-03-10

## Decision
Keep SQLite-first as the migration target.
`, 'utf8');

  const artifact = writeProjectHistoryArtifact({
    rootDir,
    outputPath: 'docs/reference/project-memory/session-decision-history.json',
    now: '2026-03-11T12:00:00.000Z',
  });

  const persisted = JSON.parse(
    readFileSync(join(rootDir, 'docs', 'reference', 'project-memory', 'session-decision-history.json'), 'utf8')
  );

  assert.equal(persisted.decisions.summary.total, artifact.decisions.summary.total);
  assert.equal(persisted.sessions.summary.total, artifact.sessions.summary.total);
});

test('CLI writes the requested project history artifact for a real node invocation', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-project-history-cli-'));
  mkdirSync(join(rootDir, '.sessions'), { recursive: true });
  mkdirSync(join(rootDir, 'docs', 'reference', 'project-memory'), { recursive: true });

  writeFileSync(join(rootDir, '.sessions', '2026-03-11-1135.md'), `# Session 2026-03-11 11:35
**Project:** claude_ctx
**Branch:** master
**Lead:** codex
**Goals:** Export project memory

## Actions
- Implement export generator

## Errors & Solutions

## Decisions
- Use docs reference artifact for deterministic exports

## Files Modified
- scripts/docs/project-history.js

## Tasks
- Build docs export

## Summary
History export completed.
`, 'utf8');

  const scriptPath = resolve('scripts/docs/project-history.js');
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--write', 'docs/reference/project-memory/session-decision-history.json'],
    {
      cwd: rootDir,
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const persisted = JSON.parse(
    readFileSync(join(rootDir, 'docs', 'reference', 'project-memory', 'session-decision-history.json'), 'utf8')
  );
  assert.equal(persisted.sessions.summary.total, 1);
  assert.equal(persisted.decisions.summary.bySource.session, 1);
});
