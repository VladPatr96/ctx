import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerCtxTools } from '../scripts/mcp/register-ctx-tools.js';

function createRegistrySandbox() {
  const root = mkdtempSync(join(tmpdir(), 'ctx-mcp-tools-'));
  return {
    root,
    dataDir: join(root, 'data'),
    registryFile: join(root, 'skill-registry.json'),
    cleanup() {
      try {
        rmSync(root, { recursive: true, force: true });
      } catch {
        // SQLite-backed stores can keep Windows file handles open until process exit.
      }
    },
  };
}

function createServer() {
  return new McpServer({ name: 'ctx-test-hub', version: '0.0.0-test' });
}

function registerTestTools(server, { dataDir }) {
  registerCtxTools(server, {
    getSession: () => ({ actions: [], errors: [], tasks: [] }),
    saveSession: () => {},
    runCommand: async () => ({ success: true, stdout: '[]', stderr: '' }),
    readJson: () => null,
    DATA_DIR: dataDir,
    GITHUB_OWNER: 'test-owner',
    knowledgeStore: null,
    kbSync: null,
    getResults: () => [],
    saveResults: () => {},
    cacheStore: null,
  });
}

async function listTools(server) {
  const listHandler = server.server._requestHandlers.get('tools/list');
  assert.equal(typeof listHandler, 'function');
  const result = await listHandler({ method: 'tools/list', params: {} }, {});
  assert.ok(Array.isArray(result.tools));
  return result.tools;
}

test('registerCtxTools exposes protocol-compliant tools/list surface on a real McpServer', async () => {
  const sandbox = createRegistrySandbox();
  const previousRegistryFile = process.env.CTX_SKILL_REGISTRY_FILE;
  process.env.CTX_SKILL_REGISTRY_FILE = sandbox.registryFile;

  try {
    const server = createServer();
    registerTestTools(server, sandbox);
    const tools = await listTools(server);

    assert.ok(tools.length >= 80);
    assert.equal(new Set(tools.map((tool) => tool.name)).size, tools.length);
    assert.ok(tools.some((tool) => tool.name === 'ctx_get_pipeline'));
    assert.ok(tools.some((tool) => tool.name === 'ctx_worktree_create'));
    assert.ok(tools.some((tool) => tool.name === 'ctx_provider_health'));

    for (const tool of tools) {
      assert.match(tool.name, /^ctx_/);
      assert.equal(typeof tool.description, 'string');
      assert.ok(tool.description.trim().length > 0, `Missing description for ${tool.name}`);
      assert.equal(tool.inputSchema?.type, 'object', `Non-object schema for ${tool.name}`);
    }

    assert.equal(existsSync(sandbox.registryFile), true);
  } finally {
    if (previousRegistryFile === undefined) delete process.env.CTX_SKILL_REGISTRY_FILE;
    else process.env.CTX_SKILL_REGISTRY_FILE = previousRegistryFile;
    sandbox.cleanup();
  }
});

test('registerCtxTools publishes skill tools with object schemas and descriptions', async () => {
  const sandbox = createRegistrySandbox();
  const previousRegistryFile = process.env.CTX_SKILL_REGISTRY_FILE;
  process.env.CTX_SKILL_REGISTRY_FILE = sandbox.registryFile;

  try {
    const server = createServer();
    registerTestTools(server, sandbox);
    const tools = await listTools(server);
    const providerHealthTool = tools.find((tool) => tool.name === 'ctx_provider_health');

    assert.ok(providerHealthTool);
    assert.equal(typeof providerHealthTool.description, 'string');
    assert.ok(providerHealthTool.description.trim().length > 0);
    assert.equal(providerHealthTool.inputSchema.type, 'object');
    assert.equal(providerHealthTool.inputSchema.properties?.params, undefined);
  } finally {
    if (previousRegistryFile === undefined) delete process.env.CTX_SKILL_REGISTRY_FILE;
    else process.env.CTX_SKILL_REGISTRY_FILE = previousRegistryFile;
    sandbox.cleanup();
  }
});
