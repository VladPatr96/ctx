#!/usr/bin/env node

/**
 * ctx-wizard.js — Interactive CTX setup wizard
 *
 * Guides users through CTX provider setup with auto-detection,
 * validation, and configuration of AI coding assistants.
 *
 * Usage:
 *   node scripts/ctx-wizard.js              — Run interactive wizard
 *   node scripts/ctx-wizard.js --dry-run    — Preview wizard without making changes
 */

import { createInterface } from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { detectProviders } from './setup/provider-detector.js';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasState, loadState, saveState, clearState } from './setup/state-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

const isDryRun = process.argv.includes('--dry-run');

/**
 * Create readline interface for user prompts.
 * @returns {readline.Interface} Readline interface
 */
function createReadline() {
  return createInterface({ input, output });
}

/**
 * Prompt user with a yes/no question.
 * @param {readline.Interface} rl - Readline interface
 * @param {string} question - Question to ask
 * @returns {Promise<boolean>} True if user answers yes
 */
function askYesNo(rl, question) {
  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

/**
 * Prompt user to select a provider from a numbered list.
 * @param {readline.Interface} rl - Readline interface
 * @param {Array} providers - Array of available provider objects
 * @returns {Promise<Object|null>} Selected provider or null if cancelled
 */
function askSelectProvider(rl, providers) {
  return new Promise((resolve) => {
    console.log('\n📋 Available providers:\n');
    providers.forEach((p, idx) => {
      console.log(`  ${idx}. ${p.name} (${p.reason})`);
    });
    console.log('');

    rl.question('Select a provider by number (or press Enter to skip): ', (answer) => {
      const trimmed = answer.trim();
      if (trimmed === '') {
        resolve(null);
        return;
      }

      const index = parseInt(trimmed, 10);
      if (isNaN(index) || index < 0 || index >= providers.length) {
        console.log('⚠️  Invalid selection. Please try again.\n');
        resolve(askSelectProvider(rl, providers));
      } else {
        resolve(providers[index]);
      }
    });
  });
}

/**
 * Display welcome message and introduction.
 */
function showWelcome() {
  console.log('\n🚀 Welcome to CTX Setup Wizard\n');
  console.log('This wizard will help you configure CTX with your AI coding assistants.');
  console.log('We\'ll auto-detect installed providers and guide you through setup.\n');

  if (isDryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }
}

/**
 * Display detected providers summary.
 * @param {Array} providers - Array of provider objects
 */
function showProvidersDetected(providers) {
  const available = providers.filter((p) => p.available);
  const unavailable = providers.filter((p) => !p.available);

  console.log('🔍 Provider Detection Results:\n');

  if (available.length > 0) {
    console.log('✓ Available providers:');
    available.forEach((p) => {
      console.log(`  • ${p.name} (${p.reason})`);
    });
    console.log('');
  }

  if (unavailable.length > 0) {
    console.log('⚠ Unavailable providers:');
    unavailable.forEach((p) => {
      console.log(`  • ${p.name} (${p.reason})`);
    });
    console.log('');
  }
}

/**
 * Get installation instructions for a provider.
 * @param {string} providerId - Provider ID
 * @returns {string} Installation instructions
 */
function getInstallInstructions(providerId) {
  const instructions = {
    claude: `Claude Code:
  • Visit: https://claude.ai/download
  • Install Claude Desktop app
  • Or set ANTHROPIC_API_KEY environment variable`,

    codex: `Codex CLI:
  • Install: npm install -g @openai/codex-cli
  • Or set OPENAI_API_KEY environment variable
  • Or create ~/.codex config directory`,

    gemini: `Gemini CLI:
  • Install: npm install -g @google/gemini-cli
  • Or set GOOGLE_API_KEY environment variable
  • Or create ~/.config/gemini-cli directory`,

    opencode: `OpenCode:
  • Visit: https://opencode.dev/download
  • Install OpenCode editor
  • Or set OPENCODE_API_KEY environment variable`
  };

  return instructions[providerId] || 'No installation instructions available.';
}

/**
 * Display installation instructions for all unavailable providers.
 * @param {Array} providers - Array of unavailable provider objects
 */
function showInstallInstructions(providers) {
  console.log('\n📚 Installation Instructions:\n');
  console.log('To use CTX with these providers, install them first:\n');

  providers.forEach((provider) => {
    console.log(getInstallInstructions(provider.id));
    console.log('');
  });
}

/**
 * Prompt user to skip or retry when no providers are available.
 * @param {readline.Interface} rl - Readline interface
 * @returns {Promise<'skip'|'retry'>} User choice
 */
function askSkipOrRetry(rl) {
  return new Promise((resolve) => {
    rl.question('Would you like to (s)kip setup or (r)etry detection? (s/r): ', (answer) => {
      const normalized = answer.trim().toLowerCase();
      if (normalized === 's' || normalized === 'skip') {
        resolve('skip');
      } else if (normalized === 'r' || normalized === 'retry') {
        resolve('retry');
      } else {
        console.log('⚠️  Invalid choice. Please enter "s" to skip or "r" to retry.\n');
        resolve(askSkipOrRetry(rl));
      }
    });
  });
}

/**
 * Prompt user to resume from saved state or start fresh.
 * @param {readline.Interface} rl - Readline interface
 * @returns {Promise<boolean>} True if user wants to resume
 */
function askResume(rl) {
  return new Promise((resolve) => {
    console.log('💾 Previous wizard session detected!\n');
    rl.question('Would you like to (r)esume or start (f)resh? (r/f): ', (answer) => {
      const normalized = answer.trim().toLowerCase();
      if (normalized === 'r' || normalized === 'resume') {
        resolve(true);
      } else if (normalized === 'f' || normalized === 'fresh') {
        resolve(false);
      } else {
        console.log('⚠️  Invalid choice. Please enter "r" to resume or "f" to start fresh.\n');
        resolve(askResume(rl));
      }
    });
  });
}

/**
 * Configure a selected provider by running ctx-setup.js.
 * @param {Object} provider - Provider object to configure
 * @returns {boolean} True if configuration succeeded
 */
function configureProvider(provider) {
  console.log(`\n⚙️  Configuring ${provider.name}...\n`);

  if (isDryRun) {
    console.log(`✓ [DRY RUN] Would configure ${provider.name}\n`);
    return true;
  }

  const setupScript = join(ROOT_DIR, 'scripts', 'ctx-setup.js');
  const result = spawnSync('node', [setupScript, provider.id], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    shell: false
  });

  if (result.status === 0) {
    console.log(`\n✓ ${provider.name} configured successfully\n`);
    return true;
  } else {
    console.error(`\n✗ Failed to configure ${provider.name}\n`);
    return false;
  }
}

/**
 * Run the interactive wizard.
 */
async function runWizard() {
  showWelcome();

  const rl = createReadline();

  try {
    // Check for existing state and ask to resume
    let savedState = null;
    if (hasState() && !isDryRun) {
      const shouldResume = await askResume(rl);
      if (shouldResume) {
        try {
          savedState = loadState();
          console.log('✓ Resuming from previous session\n');
        } catch (error) {
          console.error('⚠️  Failed to load saved state:', error.message);
          console.log('Starting fresh...\n');
          clearState();
        }
      } else {
        console.log('✓ Starting fresh\n');
        clearState();
      }
    }

    // Detect providers with retry loop
    let providers = [];
    let availableProviders = [];
    let shouldRetryDetection = true;
    let configuredProviderIds = savedState?.configuredProviders || [];

    while (shouldRetryDetection) {
      // Detect providers
      console.log('Detecting installed AI providers...\n');
      providers = detectProviders();
      showProvidersDetected(providers);

      // Filter available providers (excluding already configured ones)
      availableProviders = providers.filter((p) => p.available && !configuredProviderIds.includes(p.id));

      // Handle no available providers
      if (availableProviders.length === 0) {
        const unavailableProviders = providers.filter((p) => !p.available);
        showInstallInstructions(unavailableProviders);

        const choice = await askSkipOrRetry(rl);

        if (choice === 'skip') {
          console.log('\n👋 Setup skipped. Install a provider and run this wizard again!\n');

          // Save state so user can resume later
          if (!isDryRun && configuredProviderIds.length > 0) {
            try {
              saveState({
                configuredProviders: configuredProviderIds,
                lastUpdated: new Date().toISOString()
              });
            } catch (error) {
              console.error('⚠️  Failed to save wizard state:', error.message);
            }
          }

          rl.close();
          return;
        }

        // User chose retry, loop will continue
        console.log('\n🔄 Retrying provider detection...\n');
      } else {
        // Providers found, exit retry loop
        shouldRetryDetection = false;
      }
    }

    // Ask if user wants to continue with setup
    const shouldContinue = await askYesNo(rl, 'Would you like to continue with setup?');

    if (!shouldContinue) {
      console.log('\n👋 Setup cancelled. Run this wizard again when you\'re ready!\n');

      // Save state so user can resume later
      if (!isDryRun && configuredProviderIds.length > 0) {
        try {
          saveState({
            configuredProviders: configuredProviderIds,
            lastUpdated: new Date().toISOString()
          });
        } catch (error) {
          console.error('⚠️  Failed to save wizard state:', error.message);
        }
      }

      rl.close();
      return;
    }

    // Provider selection and configuration loop
    let configuredCount = configuredProviderIds.length;
    let shouldConfigureMore = true;

    if (savedState && configuredCount > 0) {
      console.log(`📝 Previously configured ${configuredCount} provider(s)\n`);
    }

    while (shouldConfigureMore && availableProviders.length > 0) {
      const selectedProvider = await askSelectProvider(rl, availableProviders);

      if (!selectedProvider) {
        console.log('\n⏭️  Skipping provider selection.\n');
        break;
      }

      const success = configureProvider(selectedProvider);
      if (success) {
        configuredCount++;
        configuredProviderIds.push(selectedProvider.id);

        // Save state after successful configuration
        if (!isDryRun) {
          try {
            saveState({
              configuredProviders: configuredProviderIds,
              lastUpdated: new Date().toISOString()
            });
          } catch (error) {
            console.error('⚠️  Failed to save wizard state:', error.message);
          }
        }
      }

      // Remove configured provider from list
      const idx = availableProviders.findIndex((p) => p.id === selectedProvider.id);
      if (idx !== -1) {
        availableProviders.splice(idx, 1);
      }

      // Ask if user wants to configure another provider
      if (availableProviders.length > 0) {
        shouldConfigureMore = await askYesNo(rl, 'Would you like to configure another provider?');
      } else {
        shouldConfigureMore = false;
      }
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log(`✓ Setup complete! Configured ${configuredCount} provider(s).`);
    console.log('='.repeat(50) + '\n');

    // Clear state on successful completion
    if (!isDryRun) {
      try {
        clearState();
      } catch (error) {
        console.error('⚠️  Failed to clear wizard state:', error.message);
      }
    }

  } catch (error) {
    console.error('\n✗ Error during setup:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

/**
 * Main entry point.
 */
async function main() {
  try {
    await runWizard();
  } catch (error) {
    console.error('\n✗ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
