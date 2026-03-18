import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  buildOrchestrationBoundaryBrief,
  writeOrchestrationBoundaryBrief,
} from '../src/docs/orchestration-boundary-brief.js';
import { OrchestrationBoundaryBriefSchema } from '../src/contracts/artifact-schemas.js';

test('buildOrchestrationBoundaryBrief returns a schema-valid brief with explicit runtime and product boundaries', () => {
  const artifact = buildOrchestrationBoundaryBrief({
    now: '2026-03-12T12:45:00.000Z',
  });

  assert.equal(artifact.title, 'Orchestration Boundary and Programmable Pipeline Model');
  assert.equal(artifact.concernMap.length, 4);
  assert.equal(artifact.concernMap[0].id, 'decomposition');
  assert.equal(artifact.concernMap[1].id, 'branching');
  assert.equal(artifact.concernMap[2].id, 'batch_execution');
  assert.equal(artifact.concernMap[3].id, 'programmable_pipeline_builder');
  assert.ok(artifact.executionBoundary.coreRuntimeResponsibilities.some((entry) => /task and step state machines/i.test(entry)));
  assert.ok(artifact.executionBoundary.deferredProductSurfaces.some((entry) => /pipeline templates/i.test(entry)));
  assert.ok(artifact.rolloutGuards.some((entry) => /public DSL or visual builder/i.test(entry)));
  assert.ok(artifact.nonGoals.some((entry) => /advanced orchestration/i.test(entry)));

  assert.doesNotThrow(() => OrchestrationBoundaryBriefSchema.parse(artifact));
});

test('writeOrchestrationBoundaryBrief writes a schema-valid JSON artifact', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-orchestration-brief-'));
  mkdirSync(join(rootDir, 'docs', 'research'), { recursive: true });

  const artifact = writeOrchestrationBoundaryBrief({
    outputPath: join(rootDir, 'docs', 'research', 'orchestration-programmable-pipeline-boundary.json'),
    now: '2026-03-12T12:45:00.000Z',
  });

  const persisted = JSON.parse(
    readFileSync(join(rootDir, 'docs', 'research', 'orchestration-programmable-pipeline-boundary.json'), 'utf8')
  );

  assert.equal(persisted.title, artifact.title);
  assert.equal(persisted.concernMap.length, artifact.concernMap.length);
  assert.equal(
    persisted.executionBoundary.deferredProductSurfaces.length,
    artifact.executionBoundary.deferredProductSurfaces.length
  );
});

test('CLI writes the requested orchestration brief artifact for a real node invocation', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-orchestration-cli-'));
  mkdirSync(join(rootDir, 'docs', 'research'), { recursive: true });

  const scriptPath = resolve('src/docs/orchestration-boundary-brief.js');
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--write', 'docs/research/orchestration-programmable-pipeline-boundary.json'],
    {
      cwd: rootDir,
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const persisted = JSON.parse(
    readFileSync(join(rootDir, 'docs', 'research', 'orchestration-programmable-pipeline-boundary.json'), 'utf8')
  );
  assert.equal(persisted.concernMap[3].id, 'programmable_pipeline_builder');
  assert.ok(persisted.rolloutGuards.length >= 4);
});

test('canonical research brief documents orchestration concern mapping and deferred build commitment', () => {
  const source = readFileSync(resolve('docs/research/ORCHESTRATION_PROGRAMMABLE_PIPELINES_BOUNDARY.md'), 'utf8');

  assert.match(source, /^# Orchestration Boundary and Programmable Pipeline Model/m);
  assert.match(source, /^## Concern map/m);
  assert.match(source, /^## Core runtime boundary/m);
  assert.match(source, /^## Deferred product surfaces/m);
  assert.match(source, /^## Non-goals/m);
  assert.match(source, /docs\/research\/orchestration-programmable-pipeline-boundary\.json/);
});
