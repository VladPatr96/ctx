import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { listCliCommands } from '../scripts/cli/command-manifest.js';
import { listMcpTools } from '../src/tools/tool-manifest.js';
import { buildInterfaceReference, writeInterfaceReference } from '../src/docs/interface-reference.js';

test('listCliCommands exposes built-in and skill-derived CLI surfaces', () => {
  const commands = listCliCommands();

  assert.ok(commands.some((command) => command.name === 'get_pipeline' && command.source === 'built_in'));
  assert.ok(commands.some((command) => command.name === 'provider-health' && command.source === 'skill'));
  assert.ok(commands.every((command) => command.description.length > 0));
});

test('listMcpTools captures built-in and skill-derived MCP registrations', () => {
  const registryFile = join(mkdtempSync(join(tmpdir(), 'ctx-interface-registry-')), 'skill-registry.json');
  const tools = listMcpTools({ registryFile });

  assert.ok(tools.some((tool) => tool.name === 'ctx_get_pipeline' && tool.source === 'built_in'));
  assert.ok(tools.some((tool) => tool.name === 'ctx_provider_health' && tool.source === 'skill'));
  assert.ok(tools.every((tool) => tool.inputType === 'object'));
});

test('writeInterfaceReference writes a schema-valid artifact', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-interface-write-'));
  const artifactPath = 'docs/reference/interface-surface.json';
  const reference = writeInterfaceReference({
    rootDir,
    outputPath: artifactPath,
    now: '2026-03-11T13:00:00.000Z',
  });

  const persisted = JSON.parse(readFileSync(join(rootDir, 'docs', 'reference', 'interface-surface.json'), 'utf8'));
  assert.equal(persisted.cli.summary.total, reference.cli.summary.total);
  assert.equal(persisted.mcp.summary.total, reference.mcp.summary.total);
});

test('CLI writes interface reference artifact for a real node invocation', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-interface-cli-'));
  const scriptPath = resolve('scripts/docs/interface-reference.js');
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--write', 'docs/reference/interface-surface.json'],
    {
      cwd: rootDir,
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const persisted = JSON.parse(readFileSync(join(rootDir, 'docs', 'reference', 'interface-surface.json'), 'utf8'));
  assert.ok(persisted.cli.summary.total >= 5);
  assert.ok(persisted.mcp.summary.total >= 80);
});
