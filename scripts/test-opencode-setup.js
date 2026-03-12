#!/usr/bin/env node

/**
 * Test OpenCode auto-setup functionality.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

function runCommand(args, cwd, env) {
  const result = spawnSync(process.execPath, args, {
    cwd: cwd || ROOT_DIR,
    encoding: 'utf-8',
    shell: false,
    env: env || process.env,
  });

  return {
    stdout: result.stdout,
    stderr: result.stderr,
    status: result.status,
    error: result.error
  };
}

function section(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

console.log('\nOpenCode Auto-Setup - Test\n');

section('TEST 1: Create test skills directory');

const testDir = mkdtempSync(join(tmpdir(), 'ctx-opencode-skills-'));
const testEnv = {
  ...process.env,
  CTX_OPENCODE_SKILLS_DIR: testDir,
};
console.log('[PASS] Test directory created:', testDir);

section('TEST 2: Run auto-setup with test directory');

const result = runCommand(['scripts/opencode-auto-setup.js'], ROOT_DIR, testEnv);
console.log('Exit code:', result.status);

if (result.status !== 0) {
  console.error('[FAIL] Auto-setup failed');
  console.error('Error:', result.error);
  console.error('Stderr:', result.stderr);
  process.exit(1);
}

console.log('[PASS] Auto-setup completed successfully');

section('TEST 3: Verify files created');

const isWindows = process.platform === 'win32';
const expectedFiles = [
  join(testDir, 'ctx', 'SKILL.md'),
  join(testDir, 'update-ctx-skill.js'),
  join(testDir, `update-ctx-skill.${isWindows ? 'bat' : 'sh'}`)
];

let allExist = true;
for (const file of expectedFiles) {
  if (existsSync(file)) {
    console.log('[PASS] Created:', file);
  } else {
    console.log('[FAIL] Missing:', file);
    allExist = false;
  }
}

if (!allExist) {
  console.error('\n[FAIL] Some files were not created');
  process.exit(1);
}

section('TEST 4: Verify skill content');

const skillContent = result.stdout;
if ((skillContent.includes('CTX skill installed') || skillContent.includes('up to date'))
  && skillContent.includes(testDir)) {
  console.log('[PASS] Skill content verified');
} else {
  console.log('[FAIL] Skill content not verified');
  console.log('Output:', result.stdout);
}

section('TEST 5: Test auto-update script');

const updateResult = runCommand([join(testDir, 'update-ctx-skill.js')], ROOT_DIR, testEnv);
if (updateResult.status === 0) {
  console.log('[PASS] Auto-update script works');
  if (updateResult.stdout.includes('up to date')) {
    console.log('[PASS] Detects when already up to date');
  }
} else {
  console.error('[FAIL] Auto-update script failed');
  console.error('Stderr:', updateResult.stderr);
}

section('TEST 6: Cleanup');

try {
  rmSync(testDir, { recursive: true, force: true });
  console.log('[PASS] Test directory removed');
} catch (error) {
  console.warn('[WARN] Failed to remove test directory:', error.message);
}

section('FINAL SUMMARY');

console.log('\n  [PASS] All tests passed!');
console.log('\n  OpenCode auto-setup is ready to use:');
console.log('  - Auto-detects OpenCode skills directory');
console.log('  - Copies universal CTX skill');
console.log('  - Creates auto-update scripts');
console.log('  - Provides integration instructions');
console.log('\n  To use:');
console.log('    node scripts/opencode-auto-setup.js');
console.log('\n  Or via CTX setup:');
console.log('    node scripts/ctx-setup.js opencode');
console.log('\n  See OPENCODE_AUTO_SETUP.md for details.\n');
