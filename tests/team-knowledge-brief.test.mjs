import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  buildTeamKnowledgeBoundaryBrief,
  writeTeamKnowledgeBoundaryBrief,
} from '../scripts/docs/team-knowledge-brief.js';
import { TeamKnowledgeBoundaryBriefSchema } from '../scripts/contracts/team-knowledge-brief-schemas.js';

test('buildTeamKnowledgeBoundaryBrief returns a schema-valid brief with explicit boundaries and non-goals', () => {
  const artifact = buildTeamKnowledgeBoundaryBrief({
    now: '2026-03-12T12:30:00.000Z',
  });

  assert.equal(artifact.title, 'Shared Knowledge Boundary and Access Model');
  assert.equal(artifact.boundaries.length, 3);
  assert.equal(artifact.boundaries[0].id, 'single_user_runtime');
  assert.equal(artifact.boundaries[1].id, 'shared_team_knowledge');
  assert.equal(artifact.boundaries[2].id, 'enterprise_deferred');
  assert.ok(artifact.accessModel.roles.some((role) => role.id === 'workspace_owner'));
  assert.ok(artifact.accessModel.rolloutGuards.some((guard) => /team-write semantics/i.test(guard)));
  assert.ok(artifact.nonGoals.some((goal) => /multi-user state machine/i.test(goal)));

  assert.doesNotThrow(() => TeamKnowledgeBoundaryBriefSchema.parse(artifact));
});

test('writeTeamKnowledgeBoundaryBrief writes a schema-valid JSON artifact', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-team-knowledge-brief-'));
  mkdirSync(join(rootDir, 'docs', 'research'), { recursive: true });

  const artifact = writeTeamKnowledgeBoundaryBrief({
    outputPath: join(rootDir, 'docs', 'research', 'team-shared-knowledge-boundary.json'),
    now: '2026-03-12T12:30:00.000Z',
  });

  const persisted = JSON.parse(
    readFileSync(join(rootDir, 'docs', 'research', 'team-shared-knowledge-boundary.json'), 'utf8')
  );

  assert.equal(persisted.title, artifact.title);
  assert.equal(persisted.boundaries.length, artifact.boundaries.length);
  assert.equal(persisted.accessModel.roles.length, artifact.accessModel.roles.length);
});

test('CLI writes the requested team knowledge brief artifact for a real node invocation', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-team-knowledge-cli-'));
  mkdirSync(join(rootDir, 'docs', 'research'), { recursive: true });

  const scriptPath = resolve('scripts/docs/team-knowledge-brief.js');
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--write', 'docs/research/team-shared-knowledge-boundary.json'],
    {
      cwd: rootDir,
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const persisted = JSON.parse(
    readFileSync(join(rootDir, 'docs', 'research', 'team-shared-knowledge-boundary.json'), 'utf8')
  );
  assert.equal(persisted.boundaries[1].id, 'shared_team_knowledge');
  assert.ok(persisted.nonGoals.length >= 4);
});

test('canonical research brief documents the shared boundary, governance assumptions, and artifact path', () => {
  const source = readFileSync(resolve('docs/research/TEAM_SHARED_KNOWLEDGE_BOUNDARY.md'), 'utf8');

  assert.match(source, /^# Shared Knowledge Boundary and Access Model/m);
  assert.match(source, /^## Boundary map/m);
  assert.match(source, /^## Access model/m);
  assert.match(source, /^## Non-goals/m);
  assert.match(source, /docs\/research\/team-shared-knowledge-boundary\.json/);
});
