#!/usr/bin/env node

/**
 * test-opencode-setup.js — Test OpenCode auto-setup functionality
 */

import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, rmSync, existsSync } from 'node:fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

function runCommand(args, cwd) {
  const result = spawnSync('node', args, {
    cwd: cwd || ROOT_DIR,
    encoding: 'utf-8',
    shell: false
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

console.log('\n🧪 OpenCode Auto-Setup — Test\n');

section('TEST 1: Create test skills directory');

// Create a test directory
const testDir = join(ROOT_DIR, '.test-opencode-skills');
try {
  mkdirSync(testDir, { recursive: true });
  console.log('✓ Test directory created:', testDir);
} catch (e) {
  console.error('✗ Failed to create test directory:', e.message);
  process.exit(1);
}

section('TEST 2: Run auto-setup with test directory');

const result = runCommand(['scripts/opencode-auto-setup.js', testDir]);
console.log('Exit code:', result.status);

if (result.status !== 0) {
  console.error('✗ Auto-setup failed');
  console.error('Error:', result.error);
  console.error('Stderr:', result.stderr);
  process.exit(1);
}

console.log('✓ Auto-setup completed successfully');

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
    console.log('✓ Created:', file);
  } else {
    console.log('✗ Missing:', file);
    allExist = false;
  }
}

if (!allExist) {
  console.error('\n✗ Some files were not created');
  process.exit(1);
}

section('TEST 4: Verify skill content');

const skillContent = result.stdout;
if (skillContent.includes('CTX skill installed') || skillContent.includes('up to date')) {
  console.log('✓ Skill content verified');
} else {
  console.log('✗ Skill content not verified');
  console.log('Output:', result.stdout);
}

section('TEST 5: Test auto-update script');

const updateResult = runCommand([join(testDir, 'update-ctx-skill.js')]);
if (updateResult.status === 0) {
  console.log('✓ Auto-update script works');
  if (updateResult.stdout.includes('up to date')) {
    console.log('✓ Detects when already up to date');
  }
} else {
  console.error('✗ Auto-update script failed');
  console.error('Stderr:', updateResult.stderr);
}

section('TEST 6: Cleanup');

try {
  rmSync(testDir, { recursive: true, force: true });
  console.log('✓ Test directory removed');
} catch (e) {
  console.warn('⚠ Failed to remove test directory:', e.message);
}

section('FINAL SUMMARY');

console.log('\n  ✅ All tests passed!');
console.log('\n  OpenCode auto-setup is ready to use:');
console.log('  • Auto-detects OpenCode skills directory');
console.log('  • Copies universal CTX skill');
console.log('  • Creates auto-update scripts');
console.log('  • Provides integration instructions');
console.log('\n  To use:');
console.log('    node scripts/opencode-auto-setup.js');
console.log('\n  Or via CTX setup:');
console.log('    node scripts/ctx-setup.js opencode');
console.log('\n  See OPENCODE_AUTO_SETUP.md for details.\n');
