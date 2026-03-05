/**
 * provider-detector.js
 *
 * Multi-platform provider detection module.
 * Detects which AI coding assistant providers are available on the current machine.
 *
 * Supports:
 * - Claude Code
 * - Codex CLI
 * - Gemini CLI
 * - OpenCode
 *
 * Platform support: Windows, macOS, Linux
 */

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..', '..');

const HOME = process.env.HOME || process.env.USERPROFILE || '';

/**
 * Check if a CLI command is available on the system.
 * @param {string} command - Command to check
 * @returns {boolean} True if command is available
 */
export function hasCli(command) {
  const result = spawnSync(command, ['--version'], {
    stdio: 'ignore',
    shell: false
  });
  return result.status === 0;
}

/**
 * Check if CTX MCP configuration exists.
 * @returns {boolean} True if CTX MCP is configured
 */
export function hasCtxMcpConfig() {
  const mcpFile = join(ROOT_DIR, '.mcp.json');
  if (!existsSync(mcpFile)) return false;
  try {
    return readFileSync(mcpFile, 'utf-8').includes('ctx-hub');
  } catch {
    return false;
  }
}

/**
 * Detect all available AI coding assistant providers.
 * @returns {Array<{id: string, name: string, available: boolean}>} Array of provider objects
 */
export function detectProviders() {
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

/**
 * Get only available providers.
 * @returns {Array<{id: string, name: string, available: boolean}>} Array of available providers
 */
export function getAvailableProviders() {
  return detectProviders().filter((p) => p.available);
}

/**
 * Get only unavailable providers.
 * @returns {Array<{id: string, name: string, available: boolean}>} Array of unavailable providers
 */
export function getUnavailableProviders() {
  return detectProviders().filter((p) => !p.available);
}

/**
 * Check if a specific provider is available.
 * @param {string} providerId - Provider ID to check
 * @returns {boolean} True if provider is available
 */
export function isProviderAvailable(providerId) {
  const provider = detectProviders().find((p) => p.id === providerId);
  return provider ? provider.available : false;
}
