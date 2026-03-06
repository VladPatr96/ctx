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
 * Check if environment variables contain any of the specified keys.
 * @param {string[]} keys - Array of environment variable names to check
 * @returns {boolean} True if any key is set
 */
export function hasApiKey(keys) {
  return keys.some((key) => {
    const value = process.env[key];
    return value && value.trim().length > 0;
  });
}

/**
 * Check provider availability with detailed detection logic.
 * @param {Object} checks - Object with detection methods
 * @returns {{available: boolean, reason: string, details: Object}} Availability info
 */
function checkProviderAvailability(checks) {
  const details = {
    cli: checks.cli ? hasCli(checks.cli) : false,
    configDirs: checks.configDirs ? checks.configDirs.some(existsSync) : false,
    apiKeys: checks.apiKeys ? hasApiKey(checks.apiKeys) : false,
    custom: checks.custom ? checks.custom() : false
  };

  const available = details.cli || details.configDirs || details.apiKeys || details.custom;

  const reasons = [];
  if (details.custom) reasons.push('MCP configured');
  if (details.cli) reasons.push('CLI available');
  if (details.configDirs) reasons.push('config directory found');
  if (details.apiKeys) reasons.push('API key detected');

  const reason = available
    ? reasons.join(', ')
    : 'Not installed (no CLI, config, or API key found)';

  return { available, reason, details };
}

/**
 * Detect all available AI coding assistant providers.
 * @returns {Array<{id: string, name: string, available: boolean, reason: string, details: Object}>} Array of provider objects
 */
export function detectProviders() {
  const claude = checkProviderAvailability({
    cli: 'claude',
    configDirs: [],
    apiKeys: ['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY'],
    custom: hasCtxMcpConfig
  });

  const codex = checkProviderAvailability({
    cli: 'codex',
    configDirs: [join(HOME, '.codex')],
    apiKeys: ['OPENAI_API_KEY', 'CODEX_API_KEY']
  });

  const gemini = checkProviderAvailability({
    cli: 'gemini',
    configDirs: [
      join(HOME, '.config', 'gemini-cli'),
      join(HOME, '.gemini')
    ],
    apiKeys: ['GOOGLE_API_KEY', 'GEMINI_API_KEY']
  });

  const opencode = checkProviderAvailability({
    cli: 'opencode',
    configDirs: [join(HOME, '.config', 'opencode')],
    apiKeys: ['OPENCODE_API_KEY']
  });

  return [
    { id: 'claude', name: 'Claude Code', ...claude },
    { id: 'codex', name: 'Codex CLI', ...codex },
    { id: 'gemini', name: 'Gemini CLI', ...gemini },
    { id: 'opencode', name: 'OpenCode', ...opencode }
  ];
}

/**
 * Get only available providers.
 * @returns {Array<{id: string, name: string, available: boolean, reason: string, details: Object}>} Array of available providers
 */
export function getAvailableProviders() {
  return detectProviders().filter((p) => p.available);
}

/**
 * Get only unavailable providers.
 * @returns {Array<{id: string, name: string, available: boolean, reason: string, details: Object}>} Array of unavailable providers
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
