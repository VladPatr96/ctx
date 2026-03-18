#!/usr/bin/env node

/**
 * CTX Universal Installer — one command to configure all detected AI CLI providers.
 *
 * Usage:
 *   npx ctx-plugin install          # Auto-detect & configure all providers
 *   node ctx-setup.js install       # Same
 *   node ctx-setup.js claude        # Configure specific provider
 *   node ctx-setup.js --probe all   # Print detection status as JSON
 */

import { existsSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { detectProviders } from './provider-detector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = resolve(join(__dirname, '..', '..'));
const SKILL_SOURCE = join(ROOT_DIR, 'skills', 'ctx', 'SKILL.md');
const MCP_HUB_SCRIPT = join(ROOT_DIR, 'scripts', 'ctx-mcp-hub.js');

function home() {
  return process.env.HOME || process.env.USERPROFILE || '';
}

// ────────────────────────────────────────────────────────────
// Provider-specific installers
// ────────────────────────────────────────────────────────────

const PROVIDERS = {
  claude: {
    name: 'Claude Code',
    icon: '◈',
    install(projectDir) {
      // Claude Code reads .mcp.json from project root
      const mcpPath = join(projectDir, '.mcp.json');
      ensureMcpJson(mcpPath, projectDir);

      // Also copy skill to .claude/commands/ if dir exists
      const claudeDir = join(projectDir, '.claude');
      if (existsSync(claudeDir)) {
        return { status: 'ok', detail: '.mcp.json configured' };
      }
      return { status: 'ok', detail: '.mcp.json configured' };
    },
  },

  gemini: {
    name: 'Gemini CLI',
    icon: '◇',
    install(projectDir) {
      const results = [];

      // 1. Copy skill to ~/.config/gemini-cli/skills/ctx/
      const geminiSkillsDir = join(home(), '.config', 'gemini-cli', 'skills', 'ctx');
      mkdirSync(geminiSkillsDir, { recursive: true });
      copyFileSync(SKILL_SOURCE, join(geminiSkillsDir, 'SKILL.md'));
      results.push('skill → ~/.config/gemini-cli/skills/ctx/');

      // 2. Add MCP server to gemini settings
      const geminiSettingsPath = join(home(), '.gemini', 'settings.json');
      if (existsSync(geminiSettingsPath)) {
        try {
          const settings = JSON.parse(readFileSync(geminiSettingsPath, 'utf-8'));
          if (!settings.mcpServers) settings.mcpServers = {};
          if (!settings.mcpServers['ctx-hub']) {
            settings.mcpServers['ctx-hub'] = {
              command: 'node',
              args: [MCP_HUB_SCRIPT.replace(/\\/g, '/')],
            };
            writeFileSync(geminiSettingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
            results.push('MCP → ~/.gemini/settings.json');
          } else {
            results.push('MCP already configured');
          }
        } catch {
          results.push('MCP: settings.json parse error, skip');
        }
      } else {
        // Create settings.json
        const settingsDir = join(home(), '.gemini');
        mkdirSync(settingsDir, { recursive: true });
        const settings = {
          mcpServers: {
            'ctx-hub': {
              command: 'node',
              args: [MCP_HUB_SCRIPT.replace(/\\/g, '/')],
            },
          },
        };
        writeFileSync(geminiSettingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8');
        results.push('MCP → ~/.gemini/settings.json (created)');
      }

      return { status: 'ok', detail: results.join('; ') };
    },
  },

  codex: {
    name: 'Codex CLI',
    icon: '▣',
    install(projectDir) {
      const results = [];

      // 1. Copy skill to .codex/skills/ctx/
      const codexSkillDir = join(projectDir, '.codex', 'skills', 'ctx');
      mkdirSync(codexSkillDir, { recursive: true });
      copyFileSync(SKILL_SOURCE, join(codexSkillDir, 'SKILL.md'));
      results.push('skill → .codex/skills/ctx/');

      // 2. Add MCP to .codex/config.toml if not present
      const tomlPath = join(projectDir, '.codex', 'config.toml');
      if (existsSync(tomlPath)) {
        const content = readFileSync(tomlPath, 'utf-8');
        if (!content.includes('[mcp_servers.ctx-hub]')) {
          const mcpBlock = `\n[mcp_servers.ctx-hub]\ncommand = "node"\nargs = ["${MCP_HUB_SCRIPT.replace(/\\/g, '/')}"]\nstartup_timeout_sec = 30\n`;
          writeFileSync(tomlPath, content.trimEnd() + '\n' + mcpBlock, 'utf-8');
          results.push('MCP → .codex/config.toml');
        } else {
          results.push('MCP already in config.toml');
        }
      } else {
        mkdirSync(join(projectDir, '.codex'), { recursive: true });
        const toml = `[mcp_servers.ctx-hub]\ncommand = "node"\nargs = ["${MCP_HUB_SCRIPT.replace(/\\/g, '/')}"]\nstartup_timeout_sec = 30\n`;
        writeFileSync(tomlPath, toml, 'utf-8');
        results.push('MCP → .codex/config.toml (created)');
      }

      return { status: 'ok', detail: results.join('; ') };
    },
  },

  opencode: {
    name: 'OpenCode',
    icon: '●',
    install(projectDir) {
      const results = [];

      // 1. Copy skill to ~/.opencode/skills/ctx/ (common location)
      const candidates = [
        process.env.OPENCODE_SKILLS_DIR,
        join(home(), '.opencode', 'skills'),
        join(home(), '.config', 'opencode', 'skills'),
      ].filter(Boolean);

      let installed = false;
      for (const dir of candidates) {
        if (existsSync(dirname(dir))) {
          const skillDir = join(dir, 'ctx');
          mkdirSync(skillDir, { recursive: true });
          copyFileSync(SKILL_SOURCE, join(skillDir, 'SKILL.md'));
          results.push(`skill → ${skillDir}`);
          installed = true;
          break;
        }
      }

      if (!installed) {
        // Fallback: copy to project .opencode/skills/ctx/
        const localDir = join(projectDir, '.opencode', 'skills', 'ctx');
        mkdirSync(localDir, { recursive: true });
        copyFileSync(SKILL_SOURCE, join(localDir, 'SKILL.md'));
        results.push(`skill → .opencode/skills/ctx/ (local)`);
      }

      return { status: 'ok', detail: results.join('; ') };
    },
  },
};

// ────────────────────────────────────────────────────────────
// Shared helpers
// ────────────────────────────────────────────────────────────

function ensureMcpJson(mcpPath, projectDir) {
  if (existsSync(mcpPath)) {
    const content = readFileSync(mcpPath, 'utf-8');
    if (content.includes('ctx-hub')) return; // already configured

    // Add ctx-hub to existing .mcp.json
    try {
      const mcp = JSON.parse(content);
      if (!mcp.mcpServers) mcp.mcpServers = {};
      const hubRelPath = relative(projectDir, MCP_HUB_SCRIPT).replace(/\\/g, '/');
      mcp.mcpServers['ctx-hub'] = {
        command: 'node',
        args: [hubRelPath],
        env: {},
      };
      writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + '\n', 'utf-8');
    } catch {
      // Can't parse — leave it alone
    }
    return;
  }

  // Create new .mcp.json
  const hubRelPath = relative(projectDir, MCP_HUB_SCRIPT).replace(/\\/g, '/');
  const mcp = {
    mcpServers: {
      'ctx-hub': {
        command: 'node',
        args: [hubRelPath],
        env: {},
      },
    },
  };
  writeFileSync(mcpPath, JSON.stringify(mcp, null, 2) + '\n', 'utf-8');
}

// ────────────────────────────────────────────────────────────
// Main installer
// ────────────────────────────────────────────────────────────

function install(options = {}) {
  const projectDir = options.projectDir || process.cwd();
  const silent = options.silent || false;
  const log = silent ? () => {} : console.log;

  log('\n  CTX Universal Installer\n');
  log('  Detecting AI CLI providers...\n');

  // 1. Check Node.js version
  const nodeVersion = parseInt(process.version.slice(1).split('.')[0], 10);
  if (nodeVersion < 20) {
    console.error(`  ✗ Node.js ${process.version} too old. Need 20+`);
    process.exit(1);
  }

  // 2. Detect providers
  const detected = detectProviders();
  const available = detected.filter((p) => p.available && PROVIDERS[p.id]);

  if (available.length === 0) {
    log('  No AI CLI providers detected.');
    log('  Install one of: Claude Code, Gemini CLI, OpenCode, Codex CLI\n');
    return { installed: [], skipped: detected.map((p) => p.id) };
  }

  // 3. Ensure project basics
  ensureMcpJson(join(projectDir, '.mcp.json'), projectDir);
  const dataDir = join(projectDir, '.data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

  // 4. Install for each detected provider
  const results = [];

  for (const provider of available) {
    const installer = PROVIDERS[provider.id];
    if (!installer) continue;

    try {
      const result = installer.install(projectDir);
      results.push({ id: provider.id, name: installer.name, icon: installer.icon, ...result });
      log(`  ${installer.icon} ${installer.name.padEnd(15)} ✓ ${result.detail}`);
    } catch (err) {
      results.push({ id: provider.id, name: installer.name, icon: installer.icon, status: 'error', detail: err.message });
      log(`  ${installer.icon} ${installer.name.padEnd(15)} ✗ ${err.message}`);
    }
  }

  // 5. Show skipped
  const skipped = detected.filter((p) => !p.available && PROVIDERS[p.id]);
  for (const provider of skipped) {
    const installer = PROVIDERS[provider.id];
    if (installer) {
      log(`  ${installer.icon} ${installer.name.padEnd(15)} — not installed`);
    }
  }

  // 6. Summary
  const ok = results.filter((r) => r.status === 'ok');
  const failed = results.filter((r) => r.status === 'error');

  log(`\n  Configured: ${ok.length}/${Object.keys(PROVIDERS).length} providers`);
  if (failed.length > 0) {
    log(`  Failed: ${failed.map((f) => f.name).join(', ')}`);
  }
  log('');
  log('  Usage in any provider:');
  log('    /ctx                              — start session');
  log('    /ctx-consilium "your question"    — multi-provider analysis');
  log('    /ctx-search "error message"       — search knowledge base');
  log('');

  return { installed: ok.map((r) => r.id), skipped: skipped.map((s) => s.id), failed: failed.map((f) => f.id) };
}

// ────────────────────────────────────────────────────────────
// CLI
// ────────────────────────────────────────────────────────────

function printHelp() {
  console.log(`
CTX Universal Installer — plugin for all AI CLI systems

Usage:
  npx ctx-plugin install             Auto-detect & configure all providers
  npx ctx-plugin install claude      Configure specific provider
  npx ctx-plugin install --probe     Print detection status as JSON

Supported providers:
  claude    Claude Code (MCP + .mcp.json)
  gemini    Gemini CLI  (MCP + skill → ~/.config/gemini-cli/)
  codex     Codex CLI   (MCP + skill → .codex/skills/)
  opencode  OpenCode    (skill → ~/.opencode/skills/)

Examples:
  npx ctx-plugin install             # Install for all detected providers
  npx ctx-plugin install gemini      # Install only for Gemini CLI
  npx ctx-plugin install --probe     # Show what's detected
`);
}

function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    printHelp();
    process.exit(0);
  }

  if (args.includes('--probe')) {
    const detected = detectProviders();
    console.log(JSON.stringify(detected, null, 2));
    process.exit(0);
  }

  const target = args[0];

  // Single provider install
  if (target && target !== 'install' && target !== 'all' && PROVIDERS[target]) {
    console.log(`\n  Installing CTX for ${PROVIDERS[target].name}...\n`);
    const result = PROVIDERS[target].install(process.cwd());
    console.log(`  ${PROVIDERS[target].icon} ${PROVIDERS[target].name} — ${result.detail}\n`);
    process.exit(result.status === 'ok' ? 0 : 1);
  }

  // Full install (default)
  install();
}

export { install, PROVIDERS, detectProviders };

main();
