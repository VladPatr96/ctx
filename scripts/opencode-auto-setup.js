#!/usr/bin/env node

/**
 * opencode-auto-setup.js — Automatic CTX skill setup for OpenCode on startup
 * 
 * Usage:
 *   node opencode-auto-setup.js           — Auto-detect OpenCode skills dir
 *   node opencode-auto-setup.js <path>   — Use specific path
 */

import { existsSync, copyFileSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  findOpenCodeSkillsDir as resolveOpenCodeSkillsDir,
  getOpenCodeSkillsDirCandidates,
} from '../src/setup/opencode-paths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

const UNIVERSAL_SKILL = join(ROOT_DIR, 'skills', 'ctx', 'SKILL.md');

// Possible OpenCode skills directories on different platforms
const POSSIBLE_PATHS = [
  // Windows
  process.env.APPDATA && join(process.env.APPDATA, 'OpenCode', 'skills'),
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, 'OpenCode', 'skills'),
  process.env.USERPROFILE && join(process.env.USERPROFILE, '.opencode', 'skills'),
  join('C:\\Program Files\\OpenCode\\skills'),
  join('C:\\Program Files (x86)\\OpenCode\\skills'),
  
  // macOS/Linux
  process.env.HOME && join(process.env.HOME, '.opencode', 'skills'),
  process.env.HOME && join(process.env.HOME, '.config', 'opencode', 'skills'),
  '/usr/local/share/opencode/skills',
  '/opt/opencode/skills',
].filter(Boolean);

function log(message, emoji = '✓') {
  console.log(`${emoji} ${message}`);
}

function error(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function findOpenCodeSkillsDir() {
  log('Searching for OpenCode skills directory...', '🔍');

  const resolved = resolveOpenCodeSkillsDir({ env: process.env });
  if (resolved) {
    log(`Found: ${resolved}`);
    return resolved;
  }
  
  log('Not found in common locations', '⚠');
  return null;
}

function copySkill(sourcePath, destPath) {
  if (!existsSync(sourcePath)) {
    error(`Source skill not found: ${sourcePath}`);
  }
  
  const destDir = dirname(destPath);
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }
  
  const sourceContent = readFileSync(sourcePath, 'utf-8');
  
  // Check if destination exists and is identical
  let needUpdate = true;
  if (existsSync(destPath)) {
    const destContent = readFileSync(destPath, 'utf-8');
    if (sourceContent === destContent) {
      needUpdate = false;
      log('Already up to date');
    }
  }
  
  if (needUpdate) {
    // Backup existing file
    if (existsSync(destPath)) {
      const backupPath = `${destPath}.backup`;
      copyFileSync(destPath, backupPath);
      log(`Backup created: ${basename(backupPath)}`);
    }
    
    writeFileSync(destPath, sourceContent, 'utf-8');
    log('Skill copied successfully');
    return true;
  }
  
  return false;
}

function createAutoSetupScript(skillsDir) {
  const scriptPath = join(skillsDir, 'update-ctx-skill.js');
  
  const scriptContent = `#!/usr/bin/env node
/**
 * Auto-update script for CTX skill in OpenCode
 * Run this to update the CTX skill to latest version
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

const UNIVERSAL_SKILL = '${UNIVERSAL_SKILL.replace(/\\/g, '\\\\')}';
const DEST_SKILL = join('${skillsDir.replace(/\\/g, '\\\\')}', 'ctx', 'SKILL.md');

if (!existsSync(UNIVERSAL_SKILL)) {
  console.error('Source skill not found:', UNIVERSAL_SKILL);
  process.exit(1);
}

const source = readFileSync(UNIVERSAL_SKILL, 'utf-8');

if (existsSync(DEST_SKILL)) {
  const existing = readFileSync(DEST_SKILL, 'utf-8');
  if (source === existing) {
    console.log('✓ CTX skill is already up to date');
    process.exit(0);
  }
}

const destDir = dirname(DEST_SKILL);
if (!existsSync(destDir)) {
  mkdirSync(destDir, { recursive: true });
}

writeFileSync(DEST_SKILL, source, 'utf-8');
console.log('✓ CTX skill updated successfully');
console.log('  Source:', UNIVERSAL_SKILL);
console.log('  Destination:', DEST_SKILL);
`;

  writeFileSync(scriptPath, scriptContent, 'utf-8');
  log(`Auto-update script created: ${scriptPath}`);
  return scriptPath;
}

function createStartupConfig(skillsDir, autoSetupScript) {
  // Create a batch file for Windows or shell script for Unix
  const isWindows = process.platform === 'win32';
  const scriptName = isWindows ? 'update-ctx-skill.bat' : 'update-ctx-skill.sh';
  const scriptPath = join(skillsDir, scriptName);
  
  const scriptContent = isWindows
    ? `@echo off
echo Updating CTX skill...
node "${autoSetupScript}"
if errorlevel 1 (
  echo Error updating CTX skill
  pause
  exit /b 1
)
echo CTX skill updated successfully
`
    : `#!/bin/bash
echo "Updating CTX skill..."
node "${autoSetupScript}"
if [ $? -ne 0 ]; then
  echo "Error updating CTX skill"
  exit 1
fi
echo "CTX skill updated successfully"
`;

  writeFileSync(scriptPath, scriptContent, 'utf-8');
  
  if (!isWindows) {
    // Make script executable on Unix
    spawnSync('chmod', ['+x', scriptPath], { stdio: 'inherit' });
  }
  
  log(`Startup script created: ${scriptPath}`);
  return scriptPath;
}

function main() {
  console.log('\n🚀 OpenCode CTX Skill — Auto Setup\n');
  
  const customPath = process.argv[2];
  let skillsDir;
  
  if (customPath) {
    if (existsSync(customPath)) {
      skillsDir = customPath;
      log(`Using custom path: ${skillsDir}`);
    } else {
      error(`Custom path does not exist: ${customPath}`);
    }
  } else {
    skillsDir = findOpenCodeSkillsDir();
  }
  
  if (!skillsDir) {
    console.log('\nOpenCode skills directory not found.');
    console.log('\nPlease specify the path manually:');
    console.log('  node opencode-auto-setup.js <path-to-opencode-skills>\n');
    console.log('Common locations:');
    getOpenCodeSkillsDirCandidates(process.env).forEach(path => console.log(`  - ${path}`));
    console.log();
    process.exit(1);
  }
  
  const destSkillPath = join(skillsDir, 'ctx', 'SKILL.md');
  
  console.log('\n📦 Copying CTX skill...');
  const updated = copySkill(UNIVERSAL_SKILL, destSkillPath);
  
  console.log('\n🔧 Creating auto-update scripts...');
  const autoSetupScript = createAutoSetupScript(skillsDir);
  const startupScript = createStartupConfig(skillsDir, autoSetupScript);
  
  console.log('\n📝 Integration Instructions:');
  console.log('\n1. Add the following to OpenCode startup:');
  console.log(`   ${startupScript}`);
  console.log('\n2. Or create a shortcut that runs:');
  console.log(`   ${startupScript} && opencode`);
  console.log('\n3. To update manually anytime:');
  console.log(`   node ${autoSetupScript}`);
  console.log('\n4. In OpenCode, use:');
  console.log('   /ctx start');
  console.log('   /ctx task "Build REST API"');
  console.log('   /ctx status');
  console.log();
  
  if (updated) {
    log('✅ CTX skill installed/updated successfully!', '🎉');
  } else {
    log('✅ CTX skill is already up to date!', '🎉');
  }
  
  console.log('\n📚 Documentation: CTX_QUICKSTART.md');
  console.log('🌐 Universal docs: CTX_UNIVERSAL.md\n');
}

main();
