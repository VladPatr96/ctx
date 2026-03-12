import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { buildDocsInventory, classifyDocSurface, writeDocsInventory } from '../scripts/docs/build-docs-inventory.js';

test('classifyDocSurface maps canonical, migrate, and source material buckets', () => {
  assert.deepEqual(
    classifyDocSurface('README.md'),
    {
      path: 'README.md',
      sourceType: 'root',
      status: 'canonical',
      category: 'overview',
      audience: 'user',
      targetSurface: 'docs/index',
      notes: ['Product landing page and top-level installation surface.'],
    }
  );

  assert.equal(classifyDocSurface('docs/ADR_PHASE0_SQLITE_FIRST.md').status, 'canonical');
  assert.equal(classifyDocSurface('docs/release/VERSIONING.md').targetSurface, 'docs/release/versioning');
  assert.equal(classifyDocSurface('docs/research/TEAM_SHARED_KNOWLEDGE_BOUNDARY.md').category, 'research');
  assert.equal(classifyDocSurface('docs/research/TEAM_SHARED_KNOWLEDGE_BOUNDARY.md').targetSurface, 'docs/research');
  assert.equal(classifyDocSurface('docs/research/ORCHESTRATION_PROGRAMMABLE_PIPELINES_BOUNDARY.md').category, 'research');
  assert.equal(classifyDocSurface('docs/research/ORCHESTRATION_PROGRAMMABLE_PIPELINES_BOUNDARY.md').targetSurface, 'docs/research');
  assert.equal(classifyDocSurface('docs/reference/CLI_MCP_REFERENCE.md').category, 'reference');
  assert.equal(classifyDocSurface('docs/reference/dashboard/DASHBOARD_DESKTOP_REFERENCE.md').targetSurface, 'docs/reference/dashboard');
  assert.equal(classifyDocSurface('docs/reference/dashboard/DASHBOARD_DESKTOP_REFERENCE.md').audience, 'operator');
  assert.equal(classifyDocSurface('docs/reference/project-memory/SESSION_DECISION_EXPORTS.md').targetSurface, 'docs/reference/project-memory');
  assert.equal(classifyDocSurface('docs/reference/project-memory/SESSION_DECISION_EXPORTS.md').audience, 'operator');
  assert.equal(classifyDocSurface('docs/setup/providers/PROVIDER_MIGRATION_GUIDE.md').category, 'setup');
  assert.equal(classifyDocSurface('CTX_UNIVERSAL.md').status, 'migrate');
  assert.equal(classifyDocSurface('skills/ctx/SKILL.md').status, 'source_material');
  assert.equal(classifyDocSurface('agents/architect.md').targetSurface, 'docs/reference/agents');
});

test('buildDocsInventory scans canonical roots and summarizes docs buckets', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-docs-inventory-'));
  mkdirSync(join(rootDir, 'docs'), { recursive: true });
  mkdirSync(join(rootDir, 'skills', 'ctx'), { recursive: true });
  mkdirSync(join(rootDir, 'agents'), { recursive: true });

  writeFileSync(join(rootDir, 'package.json'), JSON.stringify({ name: 'ctx-doc-fixture' }), 'utf8');
  writeFileSync(join(rootDir, 'README.md'), '# README\n', 'utf8');
  writeFileSync(join(rootDir, 'CTX_UNIVERSAL.md'), '# Setup\n', 'utf8');
  writeFileSync(join(rootDir, 'WORKFLOW.md'), '# Workflow\n', 'utf8');
  writeFileSync(join(rootDir, 'docs', 'ADR_PHASE0_SQLITE_FIRST.md'), '# ADR\n', 'utf8');
  writeFileSync(join(rootDir, 'skills', 'ctx', 'SKILL.md'), '# Skill\n', 'utf8');
  writeFileSync(join(rootDir, 'agents', 'architect.md'), '# Agent\n', 'utf8');

  const inventory = buildDocsInventory({
    rootDir,
    now: '2026-03-11T12:00:00.000Z',
  });

  assert.equal(inventory.project, 'ctx-doc-fixture');
  assert.equal(inventory.summary.total, 6);
  assert.equal(inventory.summary.byStatus.canonical, 2);
  assert.equal(inventory.summary.byStatus.migrate, 2);
  assert.equal(inventory.summary.byStatus.source_material, 2);
  assert.ok(inventory.entries.some((entry) => entry.path === 'skills/ctx/SKILL.md'));
});

test('writeDocsInventory writes a schema-valid JSON artifact', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-docs-write-'));
  mkdirSync(join(rootDir, 'docs'), { recursive: true });
  writeFileSync(join(rootDir, 'README.md'), '# README\n', 'utf8');
  writeFileSync(join(rootDir, 'docs', 'TEST_MIGRATION_CLASSIFICATION.md'), '# Tests\n', 'utf8');

  const inventory = writeDocsInventory({
    rootDir,
    outputPath: 'docs/docs-surface.inventory.json',
    now: '2026-03-11T12:00:00.000Z',
  });

  const persisted = JSON.parse(readFileSync(join(rootDir, 'docs', 'docs-surface.inventory.json'), 'utf8'));
  assert.equal(persisted.summary.total, inventory.summary.total);
  assert.equal(persisted.entries[0].path, inventory.entries[0].path);
});

test('CLI writes the requested inventory artifact for real node invocation', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-docs-cli-'));
  mkdirSync(join(rootDir, 'docs'), { recursive: true });
  writeFileSync(join(rootDir, 'README.md'), '# README\n', 'utf8');
  writeFileSync(join(rootDir, 'AGENTS.md'), '# Agents\n', 'utf8');

  const scriptPath = resolve('scripts/docs/build-docs-inventory.js');
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--write', 'docs/docs-surface.inventory.json'],
    {
      cwd: rootDir,
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const persisted = JSON.parse(readFileSync(join(rootDir, 'docs', 'docs-surface.inventory.json'), 'utf8'));
  assert.equal(persisted.summary.total, 2);
  assert.equal(persisted.summary.byStatus.canonical, 1);
  assert.equal(persisted.summary.byStatus.source_material, 1);
});

test('repo inventory includes both current research briefs under docs/research', () => {
  const inventory = buildDocsInventory({
    rootDir: resolve('.'),
    now: '2026-03-12T12:45:00.000Z',
  });

  assert.ok(
    inventory.entries.some((entry) =>
      entry.path === 'docs/research/TEAM_SHARED_KNOWLEDGE_BOUNDARY.md' &&
      entry.category === 'research' &&
      entry.targetSurface === 'docs/research'
    )
  );
  assert.ok(
    inventory.entries.some((entry) =>
      entry.path === 'docs/research/ORCHESTRATION_PROGRAMMABLE_PIPELINES_BOUNDARY.md' &&
      entry.category === 'research' &&
      entry.targetSurface === 'docs/research'
    )
  );
});
