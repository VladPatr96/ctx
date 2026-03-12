import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  buildProviderMigrationArtifact,
  writeProviderMigrationArtifact,
} from '../scripts/docs/provider-migration.js';

test('buildProviderMigrationArtifact returns a schema-valid provider compatibility matrix', () => {
  const artifact = buildProviderMigrationArtifact({
    now: '2026-03-11T12:00:00.000Z',
  });

  assert.equal(artifact.summary.total, 4);
  assert.equal(artifact.summary.byHostInterface.mcp_native, 1);
  assert.equal(artifact.summary.byHostInterface.cli_wrapper, 3);
  assert.equal(artifact.summary.byRuntimeMode.cli, 4);

  const claude = artifact.providers.find((provider) => provider.id === 'claude');
  assert.equal(claude.hostInterface, 'mcp_native');
  assert.equal(claude.runtime.adapter, 'CliAdapter');

  const codex = artifact.providers.find((provider) => provider.id === 'codex');
  assert.equal(codex.hostMcpOptional, true);
});

test('writeProviderMigrationArtifact persists the requested JSON artifact', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-provider-migration-write-'));
  mkdirSync(join(rootDir, 'docs', 'setup', 'providers'), { recursive: true });

  const artifact = writeProviderMigrationArtifact({
    rootDir,
    outputPath: 'docs/setup/providers/provider-compatibility.json',
    now: '2026-03-11T12:00:00.000Z',
  });

  const persisted = JSON.parse(
    readFileSync(join(rootDir, 'docs', 'setup', 'providers', 'provider-compatibility.json'), 'utf8')
  );
  assert.equal(persisted.summary.total, artifact.summary.total);
  assert.equal(persisted.providers[0].id, artifact.providers[0].id);
});

test('CLI writes the requested provider compatibility artifact for a real node invocation', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-provider-migration-cli-'));
  mkdirSync(join(rootDir, 'docs', 'setup', 'providers'), { recursive: true });

  const scriptPath = resolve('scripts/docs/provider-migration.js');
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--write', 'docs/setup/providers/provider-compatibility.json'],
    {
      cwd: rootDir,
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const persisted = JSON.parse(
    readFileSync(join(rootDir, 'docs', 'setup', 'providers', 'provider-compatibility.json'), 'utf8')
  );
  assert.equal(persisted.summary.total, 4);
  assert.equal(persisted.summary.byHostInterface.mcp_native, 1);
});
