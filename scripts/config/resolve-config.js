/**
 * resolve-config.js — Config resolution chain for ctx.
 *
 * Resolution order:
 *   1. Project-level ctx.config.json (in git root or cwd)
 *   2. User-level ~/.config/ctx/config.json
 *   3. Environment variables (CTX_*, GITHUB_OWNER, etc.)
 *   4. Smart defaults (non-user-specific only)
 *
 * No hardcoded user-specific values. If a required value
 * (like GITHUB_OWNER) cannot be resolved, returns null
 * with an actionable error message in `warnings`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

/**
 * Locate the git repository root from cwd.
 * @param {string} [cwd]
 * @returns {string|null}
 */
export function findGitRoot(cwd = process.cwd()) {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd,
    stdio: 'pipe',
    encoding: 'utf-8',
    shell: false,
    timeout: 5000,
  });
  if (result.status === 0 && result.stdout) {
    return result.stdout.trim().replace(/\\/g, '/');
  }
  return null;
}

/**
 * Resolve the user home directory cross-platform.
 * @returns {string}
 */
export function resolveHome() {
  return (process.env.HOME || process.env.USERPROFILE || '').replace(/\\/g, '/');
}

/**
 * Read and parse a JSON file, returning null on any error.
 * @param {string} filePath
 * @returns {object|null}
 */
function readJsonSafe(filePath) {
  try {
    return JSON.parse(readFileSync(filePath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Detect GITHUB_OWNER via `gh api user`.
 * Cached after first call within the same process.
 * @returns {string|null}
 */
let _cachedGhUser = undefined;
export function detectGitHubOwner() {
  if (_cachedGhUser !== undefined) return _cachedGhUser;

  try {
    const result = spawnSync('gh', ['api', 'user', '-q', '.login'], {
      stdio: 'pipe',
      encoding: 'utf-8',
      shell: false,
      timeout: 10000,
    });
    _cachedGhUser = (result.status === 0 && result.stdout)
      ? result.stdout.trim()
      : null;
  } catch {
    _cachedGhUser = null;
  }
  return _cachedGhUser;
}

/**
 * Detect the GitHub repository name from git remote origin.
 * @param {string} [cwd]
 * @returns {string|null} e.g. "owner/repo"
 */
export function detectGitHubRepo(cwd) {
  try {
    const result = spawnSync('git', ['remote', 'get-url', 'origin'], {
      cwd,
      stdio: 'pipe',
      encoding: 'utf-8',
      shell: false,
      timeout: 5000,
    });
    if (result.status === 0 && result.stdout) {
      const match = result.stdout.trim().match(/github\.com[:/](.+?)(?:\.git)?$/);
      return match ? match[1] : null;
    }
  } catch { /* ignore */ }
  return null;
}

/**
 * @typedef {object} CtxConfig
 * @property {string|null} githubOwner - GitHub username/org
 * @property {string|null} centralRepo - Central KB repo (owner/repo)
 * @property {string|null} kbRepo - Knowledge sync repo (owner/repo)
 * @property {string} dataDir - Data directory path
 * @property {string} projectDir - Project root directory
 * @property {string|null} projectName - Project name
 * @property {string} locale - Locale for prompts (en/ru)
 * @property {number} dashboardPort - Dashboard port
 * @property {string[]} warnings - Actionable warnings for missing config
 * @property {string|null} configSource - Which config file was loaded
 */

/**
 * Resolve the full ctx configuration.
 *
 * @param {object} [options]
 * @param {string} [options.cwd] - Working directory
 * @param {boolean} [options.detectGh=true] - Whether to auto-detect via gh CLI
 * @returns {CtxConfig}
 */
export function resolveConfig(options = {}) {
  const { cwd = process.cwd(), detectGh = true } = options;
  const warnings = [];
  let configSource = null;

  // --- 1. Find config files ---
  const gitRoot = findGitRoot(cwd);
  const projectDir = gitRoot || cwd;

  const projectConfigPath = join(projectDir, 'ctx.config.json');
  const home = resolveHome();
  const userConfigPath = home ? join(home, '.config', 'ctx', 'config.json') : null;

  let fileConfig = null;

  if (existsSync(projectConfigPath)) {
    fileConfig = readJsonSafe(projectConfigPath);
    if (fileConfig) configSource = projectConfigPath;
  }

  if (!fileConfig && userConfigPath && existsSync(userConfigPath)) {
    fileConfig = readJsonSafe(userConfigPath);
    if (fileConfig) configSource = userConfigPath;
  }

  fileConfig = fileConfig || {};

  // --- 2. Resolve each field: file config → env → detection → null ---

  // githubOwner
  let githubOwner = fileConfig.githubOwner
    || process.env.GITHUB_OWNER
    || process.env.CTX_GITHUB_OWNER
    || null;

  if (!githubOwner && detectGh) {
    githubOwner = detectGitHubOwner();
  }

  if (!githubOwner) {
    warnings.push(
      'GITHUB_OWNER not set. Run "ctx init" or set GITHUB_OWNER env var, or add "githubOwner" to ctx.config.json'
    );
  }

  // centralRepo
  const centralRepo = fileConfig.centralRepo
    || process.env.CTX_CENTRAL_REPO
    || (githubOwner ? `${githubOwner}/my_claude_code` : null);

  if (!centralRepo) {
    warnings.push(
      'Central repo not configured. Set CTX_CENTRAL_REPO or add "centralRepo" to ctx.config.json'
    );
  }

  // kbRepo
  const kbRepo = fileConfig.kbRepo
    || process.env.CTX_KB_REPO
    || (githubOwner ? `${githubOwner}/ctx-knowledge` : null);

  // dataDir
  const dataDir = process.env.CTX_DATA_DIR
    || fileConfig.dataDir
    || join(projectDir, '.data');

  // projectName
  const projectName = fileConfig.projectName
    || process.env.CTX_PROJECT_NAME
    || (projectDir ? projectDir.replace(/\\/g, '/').split('/').pop() : null);

  // locale
  const locale = process.env.CTX_LOCALE
    || fileConfig.locale
    || 'ru';

  // dashboardPort
  const dashboardPort = parseInt(process.env.CTX_DASHBOARD_PORT || fileConfig.dashboardPort || '7331', 10);

  return {
    githubOwner,
    centralRepo,
    kbRepo,
    dataDir: resolve(dataDir),
    projectDir: resolve(projectDir),
    projectName,
    locale,
    dashboardPort,
    warnings,
    configSource,
  };
}

/**
 * Resolve config and throw if critical fields are missing.
 * Use this in CLI commands where we need a valid owner.
 *
 * @param {object} [options]
 * @returns {CtxConfig}
 */
export function resolveConfigStrict(options = {}) {
  const config = resolveConfig(options);
  if (!config.githubOwner) {
    const msg = config.warnings.find((w) => w.includes('GITHUB_OWNER')) || 'GITHUB_OWNER not configured';
    throw new Error(msg);
  }
  return config;
}
