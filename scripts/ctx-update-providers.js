#!/usr/bin/env node

/**
 * ctx-update-providers.js
 *
 * Updates CTX only for providers that are actually available on this machine.
 * Missing providers are skipped without failing the entire run.
 *
 * Usage:
 *   node scripts/ctx-update-providers.js
 *   npm run update:providers
 */

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');
const SETUP_SCRIPT = join(ROOT_DIR, 'scripts', 'ctx-setup.js');

const HOME = process.env.HOME || process.env.USERPROFILE || '';

function hasCli(command) {
  const result = spawnSync(command, ['--version'], {
    stdio: 'ignore',
    shell: false
  });
  return result.status === 0;
}

function hasCtxMcpConfig() {
  const mcpFile = join(ROOT_DIR, '.mcp.json');
  if (!existsSync(mcpFile)) return false;
  try {
    return readFileSync(mcpFile, 'utf-8').includes('ctx-hub');
  } catch {
    return false;
  }
}

function detectProviders() {
  return [
    {
      id: 'claude',
      name: 'Claude Code',
      available: hasCtxMcpConfig() || hasCli('claude')
    },
    {
      id: 'codex',
      name: 'Codex CLI',
      available: hasCli('codex') || existsSync(join(HOME, '.codex'))
    },
    {
      id: 'gemini',
      name: 'Gemini CLI',
      available:
        hasCli('gemini') ||
        existsSync(join(HOME, '.config', 'gemini-cli')) ||
        existsSync(join(HOME, '.gemini'))
    },
    {
      id: 'opencode',
      name: 'OpenCode',
      available: hasCli('opencode') || existsSync(join(HOME, '.config', 'opencode'))
    }
  ];
}

function runProviderSetup(providerId) {
  const result = spawnSync('node', [SETUP_SCRIPT, providerId], {
    cwd: ROOT_DIR,
    encoding: 'utf-8',
    stdio: 'pipe',
    shell: false
  });

  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);

  return result.status === 0;
}

function main() {
  console.log('Updating CTX for available providers...\n');

  const providers = detectProviders();
  const available = providers.filter((p) => p.available);
  const skipped = providers.filter((p) => !p.available);

  if (available.length === 0) {
    console.log('No supported providers found. Nothing to update.');
    process.exit(0);
  }

  let failed = 0;

  for (const provider of available) {
    console.log(`\n=== ${provider.name} (${provider.id}) ===`);
    const ok = runProviderSetup(provider.id);
    if (!ok) {
      failed += 1;
      console.error(`Failed to update ${provider.name}`);
    }
  }

  if (skipped.length > 0) {
    console.log('\nSkipped (not installed):');
    for (const provider of skipped) {
      console.log(`- ${provider.name}`);
    }
  }

  console.log('\nSummary:');
  console.log(`- Updated: ${available.length - failed}`);
  console.log(`- Failed: ${failed}`);
  console.log(`- Skipped: ${skipped.length}`);

  process.exit(failed > 0 ? 1 : 0);
}

main();
