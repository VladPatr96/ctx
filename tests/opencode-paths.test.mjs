import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  findOpenCodeSkillsDir,
  getOpenCodeSkillsDirCandidates,
  hasOpenCodeCtxInstall,
} from '../src/setup/opencode-paths.js';

const ROOT_DIR = fileURLToPath(new URL('..', import.meta.url));

function createSandbox() {
  const root = mkdtempSync(join(tmpdir(), 'ctx-opencode-paths-'));
  const home = join(root, 'home');
  const appData = join(home, 'AppData', 'Roaming');
  const localAppData = join(home, 'AppData', 'Local');
  mkdirSync(home, { recursive: true });
  mkdirSync(appData, { recursive: true });
  mkdirSync(localAppData, { recursive: true });

  return {
    root,
    home,
    env: {
      HOME: home,
      USERPROFILE: home,
      APPDATA: appData,
      LOCALAPPDATA: localAppData,
      ProgramFiles: join(root, 'Program Files'),
      'ProgramFiles(x86)': join(root, 'Program Files (x86)'),
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

test('getOpenCodeSkillsDirCandidates prioritizes explicit override and de-duplicates paths', () => {
  const sandbox = createSandbox();
  try {
    const overrideDir = join(sandbox.root, 'skills-override');
    const candidates = getOpenCodeSkillsDirCandidates({
      ...sandbox.env,
      CTX_OPENCODE_SKILLS_DIR: overrideDir,
    });

    assert.equal(candidates[0], overrideDir);
    assert.equal(new Set(candidates).size, candidates.length);
    assert.ok(candidates.includes(join(sandbox.env.APPDATA, 'OpenCode', 'skills')));
  } finally {
    sandbox.cleanup();
  }
});

test('findOpenCodeSkillsDir returns the first existing candidate directory', () => {
  const sandbox = createSandbox();
  try {
    const fallbackDir = join(sandbox.env.LOCALAPPDATA, 'OpenCode', 'skills');
    mkdirSync(fallbackDir, { recursive: true });

    const resolved = findOpenCodeSkillsDir({ env: sandbox.env });
    assert.equal(resolved, fallbackDir);

    const overrideDir = join(sandbox.root, 'override-skills');
    mkdirSync(overrideDir, { recursive: true });
    const resolvedWithOverride = findOpenCodeSkillsDir({
      env: { ...sandbox.env, CTX_OPENCODE_SKILLS_DIR: overrideDir },
    });
    assert.equal(resolvedWithOverride, overrideDir);
  } finally {
    sandbox.cleanup();
  }
});

test('hasOpenCodeCtxInstall detects ctx installation only when skill and update script exist', () => {
  const sandbox = createSandbox();
  try {
    const skillsDir = join(sandbox.root, 'override-skills');
    mkdirSync(join(skillsDir, 'ctx'), { recursive: true });
    writeFileSync(join(skillsDir, 'ctx', 'SKILL.md'), '# ctx');

    assert.equal(hasOpenCodeCtxInstall({
      env: { ...sandbox.env, CTX_OPENCODE_SKILLS_DIR: skillsDir },
    }), false);

    writeFileSync(join(skillsDir, 'update-ctx-skill.js'), '// update');

    assert.equal(hasOpenCodeCtxInstall({
      env: { ...sandbox.env, CTX_OPENCODE_SKILLS_DIR: skillsDir },
    }), true);
  } finally {
    sandbox.cleanup();
  }
});

test('update-opencode-now uses explicit override directory instead of host profile discovery', () => {
  const sandbox = createSandbox();
  try {
    const skillsDir = join(sandbox.root, 'override-skills');
    mkdirSync(join(skillsDir, 'ctx'), { recursive: true });

    const result = spawnSync(process.execPath, ['scripts/update-opencode-now.js'], {
      cwd: ROOT_DIR,
      env: {
        ...process.env,
        ...sandbox.env,
        CTX_OPENCODE_SKILLS_DIR: skillsDir,
      },
      encoding: 'utf8',
      shell: false,
    });

    assert.equal(result.status, 0);
    assert.match(result.stdout, new RegExp(skillsDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  } finally {
    sandbox.cleanup();
  }
});
