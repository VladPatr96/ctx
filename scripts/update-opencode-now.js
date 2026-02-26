#!/usr/bin/env node

/**
 * update-opencode-now.js — Quick OpenCode update script
 * Finds OpenCode skills dir and updates CTX skill immediately
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

// Possible OpenCode skills directories
const POSSIBLE_PATHS = [
  process.env.APPDATA && join(process.env.APPDATA, 'OpenCode', 'skills'),
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'OpenCode', 'skills'),
  process.env.USERPROFILE && join(process.env.USERPROFILE, '.opencode', 'skills'),
  'C:\\Program Files\\OpenCode\\skills',
  'C:\\Program Files (x86)\\OpenCode\\skills',
].filter(Boolean);

const UNIVERSAL_SKILL = join(process.cwd(), 'skills', 'ctx-universal-full', 'SKILL.md');

console.log('\n🔄 OpenCode CTX Skill — Quick Update\n');

// Find OpenCode skills directory
let skillsDir = null;
for (const path of POSSIBLE_PATHS) {
  if (existsSync(path)) {
    try {
      const stat = require('node:fs').statSync(path);
      if (stat.isDirectory()) {
        skillsDir = path;
        console.log(`✓ Found OpenCode skills: ${skillsDir}`);
        break;
      }
    } catch (e) {}
  }
}

if (!skillsDir) {
  console.log('❌ OpenCode skills directory not found.');
  console.log('\nSearched in:');
  POSSIBLE_PATHS.forEach(p => console.log(`  - ${p}`));
  console.log('\nPlease specify path manually:');
  console.log('  node update-opencode-now.js <path-to-skills>\n');
  process.exit(1);
}

// Copy universal skill
const destDir = join(skillsDir, 'ctx');
if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
}

const destPath = join(destDir, 'SKILL.md');
const sourceContent = readFileSync(UNIVERSAL_SKILL, 'utf-8');

// Check if needs update
let needUpdate = true;
if (existsSync(destPath)) {
  const destContent = readFileSync(destPath, 'utf-8');
  if (sourceContent === destContent) {
    needUpdate = false;
  }
}

if (needUpdate) {
  // Backup
  if (existsSync(destPath)) {
    const backupPath = `${destPath}.backup`;
    copyFileSync(destPath, backupPath);
    console.log('✓ Backup created');
  }

  writeFileSync(destPath, sourceContent, 'utf-8');
  console.log('✓ CTX skill updated successfully');
  console.log(`  From: ${UNIVERSAL_SKILL}`);
  console.log(`  To: ${destPath}`);
} else {
  console.log('✓ CTX skill is already up to date');
}

console.log('\n🚀 Ready to use in OpenCode:');
console.log('  /ctx start');
console.log('  /ctx task "Build API"');
console.log('  /ctx status');
console.log('\n📚 Documentation: CTX_QUICKSTART.md\n');
