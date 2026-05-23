#!/usr/bin/env node
/**
 * ctx-mcp-hub launcher.
 *
 * Claude Code installs plugins by copying files into its cache; it does NOT
 * run `npm install`. The MCP hub needs a few runtime dependencies
 * (@modelcontextprotocol/sdk, lru-cache, zod), so on first run we install them
 * if they are missing. All bootstrap output is kept off stdout, because stdout
 * is the MCP stdio protocol channel.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const sdkMarker = join(root, 'node_modules', '@modelcontextprotocol', 'sdk', 'package.json');

if (!existsSync(sdkMarker)) {
  console.error('[ctx] Installing MCP hub dependencies (first run)...');
  try {
    // execSync runs through a shell, so the shell resolves npm -> npm.cmd on
    // Windows (Node refuses to spawn .cmd files directly since CVE-2024-27980).
    execSync('npm install --omit=dev --ignore-scripts --no-audit --no-fund', {
      cwd: root,
      stdio: ['ignore', 'ignore', 'inherit'],
    });
  } catch (err) {
    console.error('[ctx] Dependency install failed:', err.message);
    console.error('[ctx] Run `npm install` manually in:', root);
    process.exit(1);
  }
}

await import('../src/core/mcp-hub.js');
