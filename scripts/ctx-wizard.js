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
 * Run the interactive wizard.
 */
async function runWizard() {
  showWelcome();

  const rl = createReadline();

  try {
    // Detect providers
    console.log('Detecting installed AI providers...\n');
    const providers = detectProviders();
    showProvidersDetected(providers);

    // Ask if user wants to continue with setup
    const shouldContinue = await askYesNo(rl, 'Would you like to continue with setup?');

    if (!shouldContinue) {
      console.log('\n👋 Setup cancelled. Run this wizard again when you\'re ready!\n');
      rl.close();
      return;
    }

    console.log('\n✓ Setup wizard will continue in future iterations...\n');

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
