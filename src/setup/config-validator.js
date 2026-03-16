/**
 * config-validator.js
 *
 * Configuration validation module for AI coding assistant providers.
 * Validates API keys, config files, and CLI tools for each provider type.
 *
 * Supports:
 * - Claude Code: MCP config, API keys, CLI
 * - Codex CLI: Config dir, API keys, CLI
 * - Gemini CLI: Config dir, API keys, CLI
 * - OpenCode: Config dir, API keys, CLI
 */

import { existsSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..', '..');

/**
 * Validation result structure
 * @typedef {Object} ValidationResult
 * @property {string} status - 'valid', 'warning', or 'invalid'
 * @property {string} message - Human-readable validation message
 * @property {Object} [details] - Additional validation details
 */

/**
 * Check if CLI command is available and get version.
 * @param {string} command - Command to check
 * @returns {{available: boolean, version?: string}} CLI availability info
 */
function checkCli(command) {
  try {
    const result = spawnSync(command, ['--version'], {
      stdio: 'pipe',
      shell: false,
      encoding: 'utf-8',
      timeout: 5000
    });

    if (result.status === 0 && result.stdout) {
      const version = result.stdout.trim().split('\n')[0];
      return { available: true, version };
    }
  } catch (error) {
    // CLI not found or error executing
  }
  return { available: false };
}

/**
 * Check if API key environment variable is set and valid.
 * @param {string[]} keys - Array of possible env var names
 * @returns {{valid: boolean, key?: string}} API key validation info
 */
function checkApiKey(keys) {
  for (const key of keys) {
    const value = process.env[key];
    if (value && value.trim().length > 0) {
      // Basic validation: should be at least 20 chars for API keys
      if (value.length >= 20) {
        return { valid: true, key };
      }
    }
  }
  return { valid: false };
}

/**
 * Validate Claude Code configuration.
 * @param {Object} provider - Provider info from detector
 * @returns {ValidationResult} Validation result
 */
function validateClaude(provider) {
  const details = {};
  const issues = [];
  const warnings = [];

  // Check MCP configuration
  const mcpFile = join(ROOT_DIR, '.mcp.json');
  if (existsSync(mcpFile)) {
    try {
      const content = readFileSync(mcpFile, 'utf-8');
      const config = JSON.parse(content);
      details.mcpConfig = existsSync(mcpFile);

      if (content.includes('ctx-hub')) {
        details.ctxHubConfigured = true;
      } else {
        warnings.push('ctx-hub not configured in .mcp.json');
      }
    } catch (error) {
      issues.push('Invalid .mcp.json format');
    }
  } else {
    issues.push('.mcp.json not found');
  }

  // Check API key
  const apiKeyCheck = checkApiKey(['ANTHROPIC_API_KEY', 'CLAUDE_API_KEY']);
  details.apiKey = apiKeyCheck.valid;
  if (!apiKeyCheck.valid) {
    warnings.push('API key not set (ANTHROPIC_API_KEY or CLAUDE_API_KEY)');
  }

  // Check CLI
  const cliCheck = checkCli('claude');
  details.cli = cliCheck.available;
  details.version = cliCheck.version;
  if (!cliCheck.available) {
    warnings.push('claude CLI not found');
  }

  // Determine overall status
  if (issues.length > 0) {
    return {
      status: 'invalid',
      message: `Claude Code validation failed: ${issues.join(', ')}`,
      details
    };
  }

  if (warnings.length > 0) {
    return {
      status: 'warning',
      message: `Claude Code is available but has warnings: ${warnings.join(', ')}`,
      details
    };
  }

  return {
    status: 'valid',
    message: 'Claude Code is properly configured',
    details
  };
}

/**
 * Validate Codex CLI configuration.
 * @param {Object} provider - Provider info from detector
 * @returns {ValidationResult} Validation result
 */
function validateCodex(provider) {
  const details = {};
  const warnings = [];
  const home = resolveHomeDir();

  // Check config directory
  const configDir = join(home, '.codex');
  details.configDir = existsSync(configDir);
  if (!details.configDir) {
    warnings.push('~/.codex directory not found');
  }

  // Check API key
  const apiKeyCheck = checkApiKey(['OPENAI_API_KEY', 'CODEX_API_KEY']);
  details.apiKey = apiKeyCheck.valid;
  if (!apiKeyCheck.valid) {
    warnings.push('API key not set (OPENAI_API_KEY or CODEX_API_KEY)');
  }

  // Check CLI
  const cliCheck = checkCli('codex');
  details.cli = cliCheck.available;
  details.version = cliCheck.version;
  if (!cliCheck.available) {
    warnings.push('codex CLI not found');
  }

  // Codex is unavailable if not installed
  if (!provider.available) {
    return {
      status: 'invalid',
      message: 'Codex CLI is not installed',
      details
    };
  }

  if (warnings.length > 0) {
    return {
      status: 'warning',
      message: `Codex CLI is available but has warnings: ${warnings.join(', ')}`,
      details
    };
  }

  return {
    status: 'valid',
    message: 'Codex CLI is properly configured',
    details
  };
}

/**
 * Validate Gemini CLI configuration.
 * @param {Object} provider - Provider info from detector
 * @returns {ValidationResult} Validation result
 */
function validateGemini(provider) {
  const details = {};
  const warnings = [];
  const home = resolveHomeDir();

  // Check config directories
  const configDirs = [
    join(home, '.config', 'gemini-cli'),
    join(home, '.gemini')
  ];
  details.configDir = configDirs.some(existsSync);
  if (!details.configDir) {
    warnings.push('No config directory found (~/.config/gemini-cli or ~/.gemini)');
  }

  // Check API key
  const apiKeyCheck = checkApiKey(['GOOGLE_API_KEY', 'GEMINI_API_KEY']);
  details.apiKey = apiKeyCheck.valid;
  if (!apiKeyCheck.valid) {
    warnings.push('API key not set (GOOGLE_API_KEY or GEMINI_API_KEY)');
  }

  // Check CLI
  const cliCheck = checkCli('gemini');
  details.cli = cliCheck.available;
  details.version = cliCheck.version;
  if (!cliCheck.available) {
    warnings.push('gemini CLI not found');
  }

  // Gemini is unavailable if not installed
  if (!provider.available) {
    return {
      status: 'invalid',
      message: 'Gemini CLI is not installed',
      details
    };
  }

  if (warnings.length > 0) {
    return {
      status: 'warning',
      message: `Gemini CLI is available but has warnings: ${warnings.join(', ')}`,
      details
    };
  }

  return {
    status: 'valid',
    message: 'Gemini CLI is properly configured',
    details
  };
}

/**
 * Validate OpenCode configuration.
 * @param {Object} provider - Provider info from detector
 * @returns {ValidationResult} Validation result
 */
function validateOpenCode(provider) {
  const details = {};
  const warnings = [];
  const home = resolveHomeDir();

  // Check config directory
  const configDir = join(home, '.config', 'opencode');
  details.configDir = existsSync(configDir);
  if (!details.configDir) {
    warnings.push('~/.config/opencode directory not found');
  }

  // Check API key
  const apiKeyCheck = checkApiKey(['OPENCODE_API_KEY']);
  details.apiKey = apiKeyCheck.valid;
  if (!apiKeyCheck.valid) {
    warnings.push('API key not set (OPENCODE_API_KEY)');
  }

  // Check CLI
  const cliCheck = checkCli('opencode');
  details.cli = cliCheck.available;
  details.version = cliCheck.version;
  if (!cliCheck.available) {
    warnings.push('opencode CLI not found');
  }

  // OpenCode is unavailable if not installed
  if (!provider.available) {
    return {
      status: 'invalid',
      message: 'OpenCode is not installed',
      details
    };
  }

  if (warnings.length > 0) {
    return {
      status: 'warning',
      message: `OpenCode is available but has warnings: ${warnings.join(', ')}`,
      details
    };
  }

  return {
    status: 'valid',
    message: 'OpenCode is properly configured',
    details
  };
}

/**
 * Validate provider configuration.
 * Main entry point for validation.
 *
 * @param {Object} provider - Provider object from detector
 * @param {string} provider.id - Provider ID (claude, codex, gemini, opencode, antigravity)
 * @param {string} provider.name - Provider name
 * @param {boolean} provider.available - Whether provider is available
 * @param {string} provider.reason - Reason for availability status
 * @param {Object} provider.details - Detection details
 * @returns {ValidationResult} Validation result
 */
export function validateProvider(provider) {
  if (!provider || !provider.id) {
    return {
      status: 'invalid',
      message: 'Invalid provider object'
    };
  }

  if (!provider.available) {
    return {
      status: 'invalid',
      message: `${provider.name || provider.id} is not available: ${provider.reason || 'unknown reason'}`,
      details: provider.details || {}
    };
  }

  switch (provider.id) {
    case 'antigravity':
      return { status: 'valid', message: 'Antigravity is properly configured', details: {} };
    case 'claude': return validateClaude(provider);
    case 'codex': return validateCodex(provider);
    case 'gemini': return validateGemini(provider);
    case 'opencode': return validateOpenCode(provider);
    default: return { status: 'invalid', message: `Unknown provider type: ${provider.id}` };
  }
}

/**
 * Validate provider configuration.
 * Main entry point for validation.
 *
 * @param {Object} provider - Provider object from detector
 * @param {string} provider.id - Provider ID (claude, codex, gemini, opencode)
 * @param {string} provider.name - Provider name
 */
export function validateAllProviders(providers) {
  return providers.map(provider => ({
    provider,
    validation: validateProvider(provider)
  }));
}

/**
 * Get validation summary statistics.
 * @param {Array<Object>} validations - Array of validation results
 * @returns {Object} Summary statistics
 */
export function getValidationSummary(validations) {
  const summary = {
    total: validations.length,
    valid: 0,
    warning: 0,
    invalid: 0
  };

  for (const { validation } of validations) {
    if (validation.status === 'valid') summary.valid++;
    else if (validation.status === 'warning') summary.warning++;
    else if (validation.status === 'invalid') summary.invalid++;
  }

  return summary;
}

function resolveHomeDir() {
  return process.env.HOME || process.env.USERPROFILE || '';
}
