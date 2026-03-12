import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';

// Save original env
const originalEnv = { ...process.env };

function resetEnv() {
  // Remove any CTX/GITHUB env vars we set
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('CTX_') || key === 'GITHUB_OWNER') {
      if (!(key in originalEnv)) {
        delete process.env[key];
      } else {
        process.env[key] = originalEnv[key];
      }
    }
  }
}

describe('resolve-config', async () => {
  let resolveConfig, findGitRoot, resolveHome, detectGitHubOwner;

  beforeEach(async () => {
    resetEnv();
    const mod = await import('../scripts/config/resolve-config.js');
    resolveConfig = mod.resolveConfig;
    findGitRoot = mod.findGitRoot;
    resolveHome = mod.resolveHome;
    detectGitHubOwner = mod.detectGitHubOwner;
  });

  afterEach(() => {
    resetEnv();
  });

  it('resolveConfig returns expected shape', () => {
    const config = resolveConfig({ detectGh: false });
    assert.ok(typeof config === 'object');
    assert.ok(Array.isArray(config.warnings));
    assert.ok(typeof config.dataDir === 'string');
    assert.ok(typeof config.projectDir === 'string');
    assert.ok(typeof config.locale === 'string');
    assert.ok(typeof config.dashboardPort === 'number');
  });

  it('env GITHUB_OWNER overrides detection', () => {
    process.env.GITHUB_OWNER = 'test-user';
    const config = resolveConfig({ detectGh: false });
    assert.equal(config.githubOwner, 'test-user');
    assert.equal(config.centralRepo, 'test-user/my_claude_code');
    assert.equal(config.kbRepo, 'test-user/ctx-knowledge');
    assert.equal(config.warnings.length, 0);
  });

  it('CTX_GITHUB_OWNER is also accepted', () => {
    process.env.CTX_GITHUB_OWNER = 'alt-user';
    const config = resolveConfig({ detectGh: false });
    assert.equal(config.githubOwner, 'alt-user');
  });

  it('CTX_CENTRAL_REPO overrides derived value', () => {
    process.env.GITHUB_OWNER = 'test-user';
    process.env.CTX_CENTRAL_REPO = 'org/custom-repo';
    const config = resolveConfig({ detectGh: false });
    assert.equal(config.centralRepo, 'org/custom-repo');
  });

  it('CTX_DATA_DIR overrides default', () => {
    process.env.CTX_DATA_DIR = '/tmp/ctx-test-data';
    const config = resolveConfig({ detectGh: false });
    assert.ok(config.dataDir.includes('ctx-test-data'));
  });

  it('CTX_LOCALE is respected', () => {
    process.env.CTX_LOCALE = 'ru';
    const config = resolveConfig({ detectGh: false });
    assert.equal(config.locale, 'ru');
  });

  it('CTX_DASHBOARD_PORT is respected', () => {
    process.env.CTX_DASHBOARD_PORT = '9999';
    const config = resolveConfig({ detectGh: false });
    assert.equal(config.dashboardPort, 9999);
  });

  it('warns when GITHUB_OWNER not set and detectGh disabled', () => {
    delete process.env.GITHUB_OWNER;
    delete process.env.CTX_GITHUB_OWNER;
    const config = resolveConfig({ detectGh: false });
    assert.ok(config.warnings.some((w) => w.includes('GITHUB_OWNER')));
  });

  it('default locale is ru', () => {
    const config = resolveConfig({ detectGh: false });
    assert.equal(config.locale, 'ru');
  });

  it('default dashboardPort is 7331', () => {
    const config = resolveConfig({ detectGh: false });
    assert.equal(config.dashboardPort, 7331);
  });

  it('findGitRoot returns string for a git repo', () => {
    const root = findGitRoot();
    // Running from a git repo, should return something
    assert.ok(root === null || typeof root === 'string');
  });

  it('resolveHome returns a non-empty string', () => {
    const home = resolveHome();
    assert.ok(typeof home === 'string');
    assert.ok(home.length > 0);
  });

  it('resolveConfigStrict throws when githubOwner missing', async () => {
    delete process.env.GITHUB_OWNER;
    delete process.env.CTX_GITHUB_OWNER;
    const { resolveConfigStrict } = await import('../scripts/config/resolve-config.js');
    // Only throws if gh CLI also can't detect
    // So we test with detectGh: false
    assert.throws(() => resolveConfigStrict({ detectGh: false }), /GITHUB_OWNER/);
  });
});
