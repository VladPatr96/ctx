import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

function createSandbox() {
  const root = mkdtempSync(join(tmpdir(), 'ctx-provider-probe-'));
  const home = join(root, 'home');
  const appData = join(home, 'AppData', 'Roaming');
  const localAppData = join(home, 'AppData', 'Local');

  mkdirSync(home, { recursive: true });
  mkdirSync(appData, { recursive: true });
  mkdirSync(localAppData, { recursive: true });
  mkdirSync(join(home, '.codex'), { recursive: true });

  return {
    root,
    env: {
      ...process.env,
      PATH: dirname(process.execPath),
      HOME: home,
      USERPROFILE: home,
      APPDATA: appData,
      LOCALAPPDATA: localAppData,
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

async function withSandboxEnv(env, fn) {
  const original = {
    HOME: process.env.HOME,
    USERPROFILE: process.env.USERPROFILE,
    APPDATA: process.env.APPDATA,
    LOCALAPPDATA: process.env.LOCALAPPDATA,
    PATH: process.env.PATH,
    OPENCODE_API_KEY: process.env.OPENCODE_API_KEY,
    CTX_OPENCODE_SKILLS_DIR: process.env.CTX_OPENCODE_SKILLS_DIR,
  };

  Object.assign(process.env, env);
  try {
    return await fn();
  } finally {
    restoreEnv(original);
  }
}

function restoreEnv(original) {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

test('probeProviders returns canonical onboarding probes', async () => {
  const sandbox = createSandbox();
  try {
    mkdirSync(join(sandbox.env.HOME, '.config', 'gemini-cli', 'skills', 'ctx-gemini'), { recursive: true });
    writeFileSync(join(sandbox.env.HOME, '.config', 'gemini-cli', 'skills', 'ctx-gemini', 'SKILL.md'), '# gemini');

    const byId = await withSandboxEnv(sandbox.env, async () => {
      const id = Date.now() + Math.random();
      const { probeProviders } = await import(`../scripts/setup/provider-probe.js?v=${id}`);
      const probes = probeProviders();
      return new Map(probes.map((probe) => [probe.id, probe]));
    });

    assert.equal(byId.get('claude').readiness, 'ready');
    assert.equal(byId.get('codex').readiness, 'ready');
    assert.equal(byId.get('gemini').readiness, 'ready');
    assert.equal(byId.get('opencode').readiness, 'unavailable');
    assert.equal(typeof byId.get('claude').statusLine, 'string');
  } finally {
    sandbox.cleanup();
  }
});

test('probeProvider marks detected but unconfigured providers as needs_setup', async () => {
  const sandbox = createSandbox();
  try {
    mkdirSync(join(sandbox.env.HOME, '.config', 'opencode'), { recursive: true });
    sandbox.env.OPENCODE_API_KEY = 'x'.repeat(24);

    const probe = await withSandboxEnv(sandbox.env, async () => {
      const id = Date.now() + Math.random();
      const { probeProvider } = await import(`../scripts/setup/provider-probe.js?v=${id}`);
      return probeProvider('opencode');
    });

    assert.equal(probe.available, true);
    assert.equal(probe.readiness, 'needs_setup');
    assert.equal(probe.ctxConfigured, false);
    assert.match(probe.reason, /Needs setup/i);
  } finally {
    sandbox.cleanup();
  }
});

test('probeProvider honors explicit OpenCode skills override for ready state', async () => {
  const sandbox = createSandbox();
  try {
    mkdirSync(join(sandbox.env.HOME, '.config', 'opencode'), { recursive: true });
    const overrideSkillsDir = join(sandbox.root, 'opencode-skills');
    mkdirSync(join(overrideSkillsDir, 'ctx'), { recursive: true });
    writeFileSync(join(overrideSkillsDir, 'ctx', 'SKILL.md'), '# ctx');
    writeFileSync(join(overrideSkillsDir, 'update-ctx-skill.js'), '// update');
    sandbox.env.OPENCODE_API_KEY = 'x'.repeat(24);
    sandbox.env.CTX_OPENCODE_SKILLS_DIR = overrideSkillsDir;

    const probe = await withSandboxEnv(sandbox.env, async () => {
      const id = Date.now() + Math.random();
      const { probeProvider } = await import(`../scripts/setup/provider-probe.js?v=${id}`);
      return probeProvider('opencode');
    });

    assert.equal(probe.available, true);
    assert.equal(probe.readiness, 'ready');
    assert.equal(probe.ctxConfigured, true);
  } finally {
    sandbox.cleanup();
  }
});

test('ctx-setup --probe returns onboarding probe json', () => {
  const sandbox = createSandbox();
  try {
    const result = spawnSync(process.execPath, ['scripts/ctx-setup.js', '--probe', 'claude'], {
      cwd: ROOT_DIR,
      env: sandbox.env,
      encoding: 'utf-8',
      shell: false,
    });

    assert.equal(result.status, 0);
    const payload = JSON.parse(result.stdout);
    assert.equal(payload.id, 'claude');
    assert.ok(['ready', 'needs_setup', 'unavailable'].includes(payload.readiness));
    assert.equal(typeof payload.statusLine, 'string');
  } finally {
    sandbox.cleanup();
  }
});

test('wizard dry-run surfaces readiness labels in detection output', () => {
  const sandbox = createSandbox();
  try {
    const result = spawnSync(process.execPath, ['scripts/ctx-wizard.js', '--dry-run'], {
      cwd: ROOT_DIR,
      env: sandbox.env,
      input: 'n\n',
      encoding: 'utf-8',
      shell: false,
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Provider Detection Results/);
    assert.match(result.stdout, /(Ready for CTX|Detected, setup recommended|Unavailable providers)/);
  } finally {
    sandbox.cleanup();
  }
});
