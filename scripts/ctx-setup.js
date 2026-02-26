#!/usr/bin/env node

/**
 * ctx-setup.js — Setup script for CTX on different providers
 *
 * Usage:
 *   node ctx-setup.js claude     — Setup for Claude Code
 *   node ctx-setup.js codex      — Setup for Codex CLI
 *   node ctx-setup.js gemini     — Setup for Gemini CLI
 *   node ctx-setup.js opencode   — Setup for OpenCode
 *   node ctx-setup.js all        — Setup for all providers
 */

import { existsSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

const providers = {
  claude: {
    name: 'Claude Code',
    description: 'MCP native support (already configured)',
    setup: setupClaude
  },
  codex: {
    name: 'Codex CLI',
    description: 'CLI wrapper (already available)',
    setup: setupCodex
  },
  gemini: {
    name: 'Gemini CLI',
    description: 'Copy skill files to ~/.config/gemini-cli/skills/',
    setup: setupGemini
  },
  opencode: {
    name: 'OpenCode',
    description: 'Auto-setup with auto-update on startup',
    setup: setupOpenCode
  }
};

function log(message) {
  console.log(`✓ ${message}`);
}

function error(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

function checkNode() {
  try {
    const version = process.version;
    const major = parseInt(version.slice(1).split('.')[0]);
    if (major < 18) {
      error(`Node.js version ${version} is too old. Please install Node.js 18+`);
    }
    log(`Node.js ${version} ✓`);
  } catch (e) {
    error('Node.js is not installed. Please install Node.js 18+ from https://nodejs.org/');
  }
}

function setupClaude() {
  const mcpFile = join(ROOT_DIR, '.mcp.json');
  
  if (existsSync(mcpFile)) {
    log(`MCP config exists: ${mcpFile}`);
    const content = readFileSync(mcpFile, 'utf-8');
    if (content.includes('ctx-hub')) {
      log('ctx-hub MCP server configured ✓');
    } else {
      error('ctx-hub not found in .mcp.json. Please add it manually.');
    }
  } else {
    error('.mcp.json not found. Please create it with ctx-hub configuration.');
  }
}

function setupCodex() {
  const cliScript = join(ROOT_DIR, 'scripts', 'ctx-cli.js');
  
  if (existsSync(cliScript)) {
    log(`CLI wrapper exists: ${cliScript}`);
  } else {
    error('CLI wrapper not found. Expected: scripts/ctx-cli.js');
  }
  
  const skillDir = join(ROOT_DIR, '.codex', 'skills', 'ctx');
  if (existsSync(join(skillDir, 'SKILL.md'))) {
    log(`Codex skill exists: ${skillDir}`);
  } else {
    log('Codex skill not found. Using skills/ctx/ fallback');
  }
}

function setupGemini() {
  const home = process.env.HOME || process.env.USERPROFILE;
  const geminiDir = join(home, '.config', 'gemini-cli', 'skills');
  
  if (!existsSync(geminiDir)) {
    log(`Creating directory: ${geminiDir}`);
    mkdirSync(geminiDir, { recursive: true });
  }
  
  const srcDir = join(ROOT_DIR, 'skills', 'ctx-gemini');
  if (!existsSync(srcDir)) {
    error(`Source directory not found: ${srcDir}`);
  }
  
  const destDir = join(geminiDir, 'ctx-gemini');
  if (!existsSync(destDir)) {
    mkdirSync(destDir, { recursive: true });
  }
  
  // Copy SKILL.md
  copyFileSync(join(srcDir, 'SKILL.md'), join(destDir, 'SKILL.md'));
  log(`Copied skill to: ${destDir}/SKILL.md`);
  
  console.log('\nTo use CTX in Gemini CLI:');
  console.log('  gemini /ctx-gemini start');
  console.log('  gemini /ctx-gemini task "Build REST API"');
  console.log('  gemini /ctx-gemini status');
}

function setupOpenCode() {
  const autoSetupScript = join(ROOT_DIR, 'scripts', 'opencode-auto-setup.js');
  
  if (!existsSync(autoSetupScript)) {
    error(`Auto-setup script not found: ${autoSetupScript}`);
  }
  
  console.log('\nRunning OpenCode auto-setup...');
  console.log('This will:');
  console.log('  1. Find OpenCode skills directory');
  console.log('  2. Copy universal CTX skill');
  console.log('  3. Create auto-update scripts');
  console.log('  4. Provide integration instructions');
  console.log();
  
  // Run the auto-setup script
  const result = spawnSync('node', [autoSetupScript], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    shell: false
  });
  
  if (result.status !== 0) {
    error('OpenCode auto-setup failed');
  }
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    console.log(`
CTX Setup Tool

Usage:
  node ctx-setup.js <provider>

 Providers:
  claude   - Claude Code (MCP native)
  codex    - Codex CLI (CLI wrapper)
  gemini   - Gemini CLI (copy skill files)
  opencode - OpenCode (auto-setup with auto-update)
  all      - Setup for all providers

Example:
  node ctx-setup.js all
`);
    process.exit(0);
  }
  
  const providerArg = args[0];
  
  if (providerArg === 'all') {
    console.log('Setting up CTX for all providers...\n');
    checkNode();
    
    for (const [key, provider] of Object.entries(providers)) {
      console.log(`\n${key.toUpperCase()}: ${provider.name}`);
      console.log(`  ${provider.description}`);
      provider.setup();
    }
    
    console.log('\n✓ Setup complete for all providers');
  } else {
    const provider = providers[providerArg];
    if (!provider) {
      error(`Unknown provider: ${providerArg}\nAvailable: ${Object.keys(providers).join(', ')}`);
    }
    
    console.log(`${provider.name}: ${provider.description}\n`);
    checkNode();
    provider.setup();
    
    console.log('\n✓ Setup complete');
  }
  
  console.log('\nSee CTX_UNIVERSAL.md for detailed documentation');
}

main();
