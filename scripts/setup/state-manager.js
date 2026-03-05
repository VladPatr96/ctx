/**
 * state-manager.js
 *
 * Wizard state persistence module.
 * Handles saving and loading wizard progress to/from disk.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..', '..');

/**
 * Resolve the data directory for wizard state.
 * @param {Object} options - Configuration options
 * @param {string} [options.dataDir] - Custom data directory
 * @returns {string} Path to data directory
 */
export function resolveStateDir(options = {}) {
  if (options.dataDir) return options.dataDir;
  if (process.env.CTX_DATA_DIR && process.env.CTX_DATA_DIR.trim()) {
    return process.env.CTX_DATA_DIR.trim();
  }
  return join(ROOT_DIR, '.data');
}

/**
 * Get the path to the wizard state file.
 * @param {Object} options - Configuration options
 * @returns {string} Path to state file
 */
export function getStateFilePath(options = {}) {
  const dataDir = resolveStateDir(options);
  return join(dataDir, 'wizard-state.json');
}

/**
 * Ensure the data directory exists.
 * @param {string} filePath - Path to file whose directory should exist
 */
function ensureDirectoryExists(filePath) {
  const dir = dirname(filePath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

/**
 * Save wizard state to disk.
 * @param {Object} state - State object to save
 * @param {Object} options - Configuration options
 * @param {string} [options.dataDir] - Custom data directory
 * @throws {Error} If state cannot be serialized or saved
 */
export function saveState(state, options = {}) {
  if (!state || typeof state !== 'object') {
    throw new Error('State must be a valid object');
  }

  const filePath = getStateFilePath(options);

  try {
    ensureDirectoryExists(filePath);
    const json = JSON.stringify(state, null, 2);
    writeFileSync(filePath, json, 'utf-8');
  } catch (err) {
    throw new Error(`Failed to save wizard state: ${err.message}`);
  }
}

/**
 * Load wizard state from disk.
 * @param {Object} options - Configuration options
 * @param {string} [options.dataDir] - Custom data directory
 * @returns {Object|null} Loaded state object, or null if no state exists
 * @throws {Error} If state file exists but cannot be read or parsed
 */
export function loadState(options = {}) {
  const filePath = getStateFilePath(options);

  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const json = readFileSync(filePath, 'utf-8');
    return JSON.parse(json);
  } catch (err) {
    throw new Error(`Failed to load wizard state: ${err.message}`);
  }
}

/**
 * Clear wizard state from disk.
 * @param {Object} options - Configuration options
 * @param {string} [options.dataDir] - Custom data directory
 */
export function clearState(options = {}) {
  const filePath = getStateFilePath(options);

  if (existsSync(filePath)) {
    try {
      unlinkSync(filePath);
    } catch (err) {
      throw new Error(`Failed to clear wizard state: ${err.message}`);
    }
  }
}

/**
 * Check if wizard state exists on disk.
 * @param {Object} options - Configuration options
 * @param {string} [options.dataDir] - Custom data directory
 * @returns {boolean} True if state file exists
 */
export function hasState(options = {}) {
  const filePath = getStateFilePath(options);
  return existsSync(filePath);
}
