#!/usr/bin/env node

/**
 * ctx-setup.js - Setup script for CTX on different providers
 *
 * Usage:
 *   node ctx-setup.js claude
 *   node ctx-setup.js codex
 *   node ctx-setup.js gemini
 *   node ctx-setup.js opencode
 *   node ctx-setup.js all
 *   node ctx-setup.js --interactive
 *   node ctx-setup.js --probe <provider|all>
 */

import { existsSync, copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { probeProvider, probeProviders } from './setup/provider-probe.js';
import { getProviderSetupDefinition } from './setup/provider-catalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

const providers = {
  claude: { ...getProviderSetupDefinition('claude'), setup: setupClaude },
  codex: { ...getProviderSetupDefinition('codex'), setup: setupCodex },
  gemini: { ...getProviderSetupDefinition('gemini'), setup: setupGemini },
  opencode: { ...getProviderSetupDefinition('opencode'), setup: setupOpenCode },
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
    const major = parseInt(version.slice(1).split('.')[0], 10);
    if (major < 20) {
      error(`Node.js version ${version} is too old. Please install Node.js 20+`);
    }
    log(`Node.js ${version}`);
  } catch {
    error('Node.js is not installed. Please install Node.js 20+ from https://nodejs.org/');
  }
}

function setupClaude() {
  const mcpFile = join(ROOT_DIR, '.mcp.json');

  if (!existsSync(mcpFile)) {
    error('.mcp.json not found. Please create it with ctx-hub configuration.');
  }

  log(`MCP config exists: ${mcpFile}`);
  const content = readFileSync(mcpFile, 'utf-8');
  if (!content.includes('ctx-hub')) {
    error('ctx-hub not found in .mcp.json. Please add it manually.');
  }

  log('ctx-hub MCP server configured');
}

function setupCodex() {
  const cliScript = join(ROOT_DIR, 'scripts', 'ctx-cli.js');

  if (!existsSync(cliScript)) {
    error('CLI wrapper not found. Expected: scripts/ctx-cli.js');
  }

  log(`CLI wrapper exists: ${cliScript}`);

  const skillDir = join(ROOT_DIR, '.codex', 'skills', 'ctx');
  if (existsSync(join(skillDir, 'SKILL.md'))) {
    log(`Codex skill exists: ${skillDir}`);
  } else {
    log('Codex skill not found. Using repository fallback skill');
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

  copyFileSync(join(srcDir, 'SKILL.md'), join(destDir, 'SKILL.md'));
  log(`Copied skill to: ${join(destDir, 'SKILL.md')}`);

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

  const result = spawnSync('node', [autoSetupScript], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    error('OpenCode auto-setup failed');
  }
}

function printHelp() {
  console.log(`
CTX Setup Tool

Usage:
  node ctx-setup.js <provider>
  node ctx-setup.js --interactive
  node ctx-setup.js --probe <provider|all>

Providers:
  claude   - Claude Code (MCP native)
  codex    - Codex CLI (CLI wrapper)
  gemini   - Gemini CLI (copy skill files)
  opencode - OpenCode (auto-setup with auto-update)
  all      - Setup for all providers

Interactive Mode:
  --interactive, --wizard  - Run interactive setup wizard with auto-detection

Probe Mode:
  --probe <provider|all>    - Print onboarding probe status as JSON

Example:
  node ctx-setup.js all
  node ctx-setup.js --interactive
  node ctx-setup.js --probe claude
`);
}

function runProbeMode(target) {
  const payload = target === 'all'
    ? probeProviders()
    : probeProvider(target);
  console.log(JSON.stringify(payload, null, 2));
}

function ensureProviderReady(providerKey, provider) {
  const probe = probeProvider(providerKey);
  if (probe.readiness === 'ready') {
    log(`${provider.name} already ready for CTX`);
    return true;
  }
  return false;
}

function verifyProviderReady(providerKey, provider) {
  const probe = probeProvider(providerKey);
  if (probe.readiness !== 'ready') {
    error(`${provider.name} setup completed but provider is still not ready: ${probe.reason}`);
  }
}

function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    process.exit(0);
  }

  const providerArg = args[0];

  if (providerArg === '--probe') {
    runProbeMode(args[1] || 'all');
    process.exit(0);
  }

  if (providerArg === '--interactive' || providerArg === '--wizard') {
    const wizardScript = join(ROOT_DIR, 'scripts', 'ctx-wizard.js');

    if (!existsSync(wizardScript)) {
      error(`Interactive wizard not found: ${wizardScript}`);
    }

    console.log('Launching interactive setup wizard...\n');

    const result = spawnSync('node', [wizardScript], {
      cwd: ROOT_DIR,
      stdio: 'inherit',
      shell: false,
    });

    process.exit(result.status || 0);
  }

  if (providerArg === 'all') {
    console.log('Setting up CTX for all providers...\n');
    checkNode();

    for (const [key, provider] of Object.entries(providers)) {
      console.log(`\n${key.toUpperCase()}: ${provider.name}`);
      console.log(`  ${provider.description}`);
      if (ensureProviderReady(key, provider)) {
        continue;
      }
      provider.setup();
      verifyProviderReady(key, provider);
    }

    console.log('\n✓ Setup complete for all providers');
  } else {
    const provider = providers[providerArg];
    if (!provider) {
      error(`Unknown provider: ${providerArg}\nAvailable: ${Object.keys(providers).join(', ')}`);
    }

    console.log(`${provider.name}: ${provider.description}\n`);
    checkNode();
    if (!ensureProviderReady(providerArg, provider)) {
      provider.setup();
      verifyProviderReady(providerArg, provider);
    }

    console.log('\n✓ Setup complete');
  }

  console.log('\nSee CTX_UNIVERSAL.md for detailed documentation');
}

main();
