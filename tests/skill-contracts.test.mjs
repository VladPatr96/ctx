import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  loadSkillCommandHandler,
  validateSkillContracts,
} from '../src/skills/skill-contracts.js';
import { registerSkillTools } from '../src/skills/skill-loader.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

function createSkillsSandbox() {
  const root = mkdtempSync(join(tmpdir(), 'ctx-skill-contracts-'));
  return {
    root,
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function writeSkill(skillsDir, {
  name,
  description = 'test skill',
  commands = [],
  indexSource = null,
  commandSources = {},
}) {
  const skillDir = join(skillsDir, name);
  mkdirSync(skillDir, { recursive: true });

  const commandBlock = commands.map((command) => `/ctx ${command}`).join('\n');
  const skillMd = [
    '---',
    `name: ${name}`,
    `description: ${description}`,
    '---',
    '',
    commandBlock,
    '',
  ].join('\n');
  writeFileSync(join(skillDir, 'SKILL.md'), skillMd, 'utf8');

  if (indexSource) {
    writeFileSync(join(skillDir, 'index.js'), indexSource, 'utf8');
  }

  if (Object.keys(commandSources).length > 0) {
    const commandsDir = join(skillDir, 'commands');
    mkdirSync(commandsDir, { recursive: true });
    for (const [command, source] of Object.entries(commandSources)) {
      writeFileSync(join(commandsDir, `${command}.js`), source, 'utf8');
    }
  }

  return skillDir;
}

test('loadSkillCommandHandler prefers index entrypoint over command file fallback', async () => {
  const sandbox = createSkillsSandbox();
  try {
    const skillPath = writeSkill(sandbox.root, {
      name: 'dual-skill',
      commands: ['alpha'],
      indexSource: "export default { alpha: async () => 'index-handler' };\n",
      commandSources: {
        alpha: "export default async function alpha() { return 'command-handler'; }\n",
      },
    });

    const resolved = await loadSkillCommandHandler({ name: 'dual-skill', path: skillPath }, 'alpha');
    const result = await resolved.handler();

    assert.equal(resolved.resolution, 'index');
    assert.match(resolved.path, /index\.js$/);
    assert.equal(result, 'index-handler');
  } finally {
    sandbox.cleanup();
  }
});

test('validateSkillContracts reports duplicate commands and missing handlers in fixture skills', async () => {
  const sandbox = createSkillsSandbox();
  try {
    writeSkill(sandbox.root, {
      name: 'skill-a',
      commands: ['alpha'],
      commandSources: {
        alpha: 'export default async function alpha() { return "ok"; }\n',
      },
    });
    writeSkill(sandbox.root, {
      name: 'skill-b',
      commands: ['alpha'],
      commandSources: {
        alpha: 'export default async function alpha() { return "duplicate"; }\n',
      },
    });
    writeSkill(sandbox.root, {
      name: 'skill-c',
      commands: ['beta'],
    });

    const report = await validateSkillContracts(sandbox.root);

    assert.equal(report.valid, false);
    assert.ok(report.violations.some((violation) => violation.type === 'duplicate-command'));
    assert.ok(report.violations.some((violation) => violation.type === 'missing-handler'));
  } finally {
    sandbox.cleanup();
  }
});

test('validateSkillContracts passes for discovered repository skills', async () => {
  const report = await validateSkillContracts();

  assert.equal(report.valid, true);
  assert.ok(report.skillCount >= 1);
  assert.ok(report.commandCount >= 1);
});

test('ctx-cli executes provider-health through shared resolver', () => {
  const result = spawnSync(process.execPath, ['scripts/ctx-cli.js', 'provider-health', '--provider', 'claude'], {
    cwd: ROOT_DIR,
    encoding: 'utf8',
    shell: false,
  });

  assert.equal(result.status, 0);
  assert.match(result.stdout, /claude/);
  assert.match(result.stdout, /healthy/);
});

test('registerSkillTools exposes provider-health MCP tool through shared resolver', async () => {
  const sandbox = createSkillsSandbox();
  const registrations = [];
  const server = {
    registerTool(name, config, handler) {
      registrations.push({ name, config, handler });
    }
  };

  const previousRegistryFile = process.env.CTX_SKILL_REGISTRY_FILE;
  process.env.CTX_SKILL_REGISTRY_FILE = join(sandbox.root, 'skill-registry.json');

  try {
    const tools = registerSkillTools(server);
    assert.equal(registrations.length, tools.length);
    assert.equal(existsSync(process.env.CTX_SKILL_REGISTRY_FILE), true);

    const providerHealthTool = registrations.find((registration) => registration.name === 'ctx_provider_health');
    assert.ok(providerHealthTool);
    assert.equal(typeof providerHealthTool.config.description, 'string');
    assert.ok(providerHealthTool.config.description.length > 0);

    const result = await providerHealthTool.handler({ provider: 'claude' });
    const payload = JSON.parse(result.content[0].text);

    assert.equal(result.isError, undefined);
    assert.equal(payload.claude.status, 'healthy');
  } finally {
    if (previousRegistryFile === undefined) delete process.env.CTX_SKILL_REGISTRY_FILE;
    else process.env.CTX_SKILL_REGISTRY_FILE = previousRegistryFile;
    sandbox.cleanup();
  }
});

test('registerSkillTools stays silent on stdout by default during MCP registration', () => {
  const sandbox = createSkillsSandbox();
  const server = {
    registerTool() {}
  };
  const previousRegistryFile = process.env.CTX_SKILL_REGISTRY_FILE;
  const previousConsoleLog = console.log;
  const logCalls = [];

  process.env.CTX_SKILL_REGISTRY_FILE = join(sandbox.root, 'skill-registry.json');
  console.log = (...args) => {
    logCalls.push(args);
  };

  try {
    registerSkillTools(server);
    assert.deepEqual(logCalls, []);
  } finally {
    console.log = previousConsoleLog;
    if (previousRegistryFile === undefined) delete process.env.CTX_SKILL_REGISTRY_FILE;
    else process.env.CTX_SKILL_REGISTRY_FILE = previousRegistryFile;
    sandbox.cleanup();
  }
});
