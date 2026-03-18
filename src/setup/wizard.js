#!/usr/bin/env node

/**
 * ctx-wizard.js - Interactive CTX setup wizard
 *
 * Guides users through CTX provider setup with auto-detection,
 * readiness probing, and configuration of AI coding assistants.
 *
 * Usage:
 *   node scripts/ctx-wizard.js              - Run interactive wizard
 *   node scripts/ctx-wizard.js --dry-run    - Preview wizard without making changes
 */

import { createInterface } from 'node:readline';
import { stdin as input, stdout as output } from 'node:process';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { hasState, loadState, saveState, clearState } from './state-manager.js';
import { runTutorial } from './tutorial.js';
import { probeProvider, probeProviders } from './provider-probe.js';
import { createWizardStateSnapshot, reconcileWizardState } from '../contracts/provider-schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

const isDryRun = process.argv.includes('--dry-run');

function createReadline() {
  return createInterface({ input, output });
}

function askYesNo(rl, question) {
  return new Promise((resolve) => {
    rl.question(`${question} (y/n): `, (answer) => {
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === 'y' || normalized === 'yes');
    });
  });
}

function askSelectProvider(rl, providers) {
  return new Promise((resolve) => {
    console.log('\nAvailable providers:\n');
    providers.forEach((provider, index) => {
      console.log(`  ${index}. ${provider.name} [${formatReadinessLabel(provider.readiness)}] (${provider.statusLine})`);
    });
    console.log('');

    rl.question('Select a provider by number (or press Enter to skip): ', (answer) => {
      const trimmed = answer.trim();
      if (trimmed === '') {
        resolve(null);
        return;
      }

      const index = parseInt(trimmed, 10);
      if (Number.isNaN(index) || index < 0 || index >= providers.length) {
        console.log('Invalid selection. Please try again.\n');
        resolve(askSelectProvider(rl, providers));
      } else {
        resolve(providers[index]);
      }
    });
  });
}

function showWelcome() {
  console.log('\nWelcome to CTX Setup Wizard\n');
  console.log('This wizard will help you configure CTX with your AI coding assistants.');
  console.log('We will auto-detect installed providers, probe readiness, and guide setup.\n');

  if (isDryRun) {
    console.log('DRY RUN MODE - No changes will be made\n');
  }
}

function showProvidersDetected(providers) {
  const ready = providers.filter((provider) => provider.readiness === 'ready');
  const needsSetup = providers.filter((provider) => provider.readiness === 'needs_setup');
  const unavailable = providers.filter((provider) => provider.readiness === 'unavailable');

  console.log('Provider Detection Results:\n');

  if (ready.length > 0) {
    console.log('Ready for CTX:');
    ready.forEach((provider) => {
      console.log(`  - ${provider.name}: ${provider.statusLine}`);
    });
    console.log('');
  }

  if (needsSetup.length > 0) {
    console.log('Detected, setup recommended:');
    needsSetup.forEach((provider) => {
      console.log(`  - ${provider.name}: ${provider.statusLine}`);
    });
    console.log('');
  }

  if (unavailable.length > 0) {
    console.log('Unavailable providers:');
    unavailable.forEach((provider) => {
      console.log(`  - ${provider.name}: ${provider.statusLine}`);
    });
    console.log('');
  }
}

function getInstallInstructions(providerId) {
  const instructions = {
    claude: `Claude Code:
  - Visit: https://claude.ai/download
  - Install Claude Desktop app
  - Or set ANTHROPIC_API_KEY environment variable`,

    codex: `Codex CLI:
  - Install: npm install -g @openai/codex-cli
  - Or set OPENAI_API_KEY environment variable
  - Or create ~/.codex config directory`,

    gemini: `Gemini CLI:
  - Install: npm install -g @google/gemini-cli
  - Or set GOOGLE_API_KEY environment variable
  - Or create ~/.config/gemini-cli directory`,

    opencode: `OpenCode:
  - Visit: https://opencode.dev/download
  - Install OpenCode editor
  - Or set OPENCODE_API_KEY environment variable`,
  };

  return instructions[providerId] || 'No installation instructions available.';
}

function showInstallInstructions(providers) {
  console.log('\nInstallation Instructions:\n');
  console.log('To use CTX with these providers, install them first:\n');

  providers.forEach((provider) => {
    console.log(getInstallInstructions(provider.id));
    console.log('');
  });
}

function askSkipOrRetry(rl) {
  return new Promise((resolve) => {
    rl.question('Would you like to (s)kip setup or (r)etry detection? (s/r): ', (answer) => {
      const normalized = answer.trim().toLowerCase();
      if (normalized === 's' || normalized === 'skip') {
        resolve('skip');
      } else if (normalized === 'r' || normalized === 'retry') {
        resolve('retry');
      } else {
        console.log('Invalid choice. Please enter "s" to skip or "r" to retry.\n');
        resolve(askSkipOrRetry(rl));
      }
    });
  });
}

function askResume(rl) {
  return new Promise((resolve) => {
    console.log('Previous wizard session detected.\n');
    rl.question('Would you like to (r)esume or start (f)resh? (r/f): ', (answer) => {
      const normalized = answer.trim().toLowerCase();
      if (normalized === 'r' || normalized === 'resume') {
        resolve(true);
      } else if (normalized === 'f' || normalized === 'fresh') {
        resolve(false);
      } else {
        console.log('Invalid choice. Please enter "r" to resume or "f" to start fresh.\n');
        resolve(askResume(rl));
      }
    });
  });
}

function configureProvider(provider) {
  console.log(`\nConfiguring ${provider.name}...\n`);

  if (isDryRun) {
    console.log(`[DRY RUN] Would configure ${provider.name} (with readiness validation)\n`);
    return true;
  }

  const beforeProbe = probeProvider(provider.id);
  if (beforeProbe.readiness === 'ready') {
    console.log(`${provider.name} is already ready for CTX\n`);
    return true;
  }

  const setupScript = join(ROOT_DIR, 'scripts', 'ctx-setup.js');
  const result = spawnSync('node', [setupScript, provider.id], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    shell: false,
  });

  if (result.status !== 0) {
    console.error(`\nFailed to configure ${provider.name}\n`);
    return false;
  }

  const afterProbe = probeProvider(provider.id);
  if (afterProbe.readiness !== 'ready') {
    console.error(`\n${provider.name} setup completed but provider is still not ready: ${afterProbe.reason}\n`);
    return false;
  }

  console.log(`\n${provider.name} configured successfully\n`);
  return true;
}

function saveWizardCheckpoint({
  checkpointStage,
  configuredProviderIds,
  pendingProviders,
  detectedProviders,
  currentProvider = null,
}) {
  if (isDryRun) {
    return;
  }

  try {
    const snapshot = createWizardStateSnapshot({
      checkpointStage,
      configuredProviders: configuredProviderIds,
      pendingProviders,
      detectedProviders,
      currentProvider,
      lastUpdated: new Date().toISOString(),
    });

    if (hasMeaningfulWizardState(snapshot)) {
      saveState(snapshot);
    } else if (hasState()) {
      clearState();
    }
  } catch (error) {
    console.error('Failed to save wizard state:', error.message);
  }
}

function hasMeaningfulWizardState(state) {
  return state.configuredProviders.length > 0
    || state.pendingProviders.length > 0
    || state.currentProvider !== null;
}

function orderProvidersByResumeQueue(providers, pendingProviderIds) {
  if (!pendingProviderIds.length) {
    return [...providers];
  }

  const order = new Map(pendingProviderIds.map((providerId, index) => [providerId, index]));
  return [...providers].sort((left, right) => {
    const leftOrder = order.get(left.id);
    const rightOrder = order.get(right.id);
    if (leftOrder === undefined && rightOrder === undefined) {
      return 0;
    }
    if (leftOrder === undefined) {
      return 1;
    }
    if (rightOrder === undefined) {
      return -1;
    }
    return leftOrder - rightOrder;
  });
}

function showResumeSummary(savedState, providers, reconciliation) {
  console.log(`Resume checkpoint: ${describeCheckpointStage(savedState.checkpointStage)}`);
  console.log(`Configured providers: ${savedState.configuredProviders.length}`);
  console.log(`Remaining detected providers: ${savedState.pendingProviders.length}`);

  if (reconciliation.requeuedProviderId) {
    console.log(`Re-queued interrupted provider: ${getProviderDisplayName(providers, reconciliation.requeuedProviderId)}`);
  }

  if (reconciliation.droppedPendingProviders.length > 0) {
    const droppedProviders = reconciliation.droppedPendingProviders
      .map((providerId) => getProviderDisplayName(providers, providerId))
      .join(', ');
    console.log(`Dropped unavailable saved providers: ${droppedProviders}`);
  }

  console.log('');
}

function describeCheckpointStage(stage) {
  switch (stage) {
    case 'selection':
      return 'provider selection';
    case 'configuration':
      return 'provider configuration';
    case 'tutorial_offer':
      return 'tutorial offer';
    default:
      return 'provider detection';
  }
}

function getProviderDisplayName(providers, providerId) {
  return providers.find((provider) => provider.id === providerId)?.name || providerId;
}

async function runWizard() {
  showWelcome();

  const rl = createReadline();

  try {
    let savedState = null;
    if (hasState() && !isDryRun) {
      const shouldResume = await askResume(rl);
      if (shouldResume) {
        try {
          savedState = loadState();
          console.log('Resuming from previous session\n');
        } catch (error) {
          console.error('Failed to load saved state:', error.message);
          console.log('Starting fresh...\n');
          clearState();
        }
      } else {
        console.log('Starting fresh\n');
        clearState();
      }
    }

    let providers = [];
    let availableProviders = [];
    let shouldRetryDetection = true;
    let configuredProviderIds = savedState?.configuredProviders || [];
    let pendingProviderIds = savedState?.pendingProviders || [];
    let resumeStateApplied = false;
    let shouldAskContinue = true;
    let detectedProviderIds = [];

    while (shouldRetryDetection) {
      console.log('Detecting installed AI providers...\n');
      providers = probeProviders();
      detectedProviderIds = providers
        .filter((provider) => provider.available)
        .map((provider) => provider.id);

      if (savedState && !resumeStateApplied) {
        const reconciliation = reconcileWizardState(savedState, providers);
        savedState = reconciliation.state;
        configuredProviderIds = [...savedState.configuredProviders];
        pendingProviderIds = [...savedState.pendingProviders];
        shouldAskContinue = savedState.checkpointStage === 'detected';
        showResumeSummary(savedState, providers, reconciliation);
        resumeStateApplied = true;
      }

      showProvidersDetected(providers);

      const detectedProviders = providers.filter((provider) => provider.available);
      availableProviders = orderProvidersByResumeQueue(detectedProviders.filter(
        (provider) => !configuredProviderIds.includes(provider.id)
      ), pendingProviderIds);

      if (detectedProviders.length === 0) {
        const unavailableProviders = providers.filter((provider) => !provider.available);
        showInstallInstructions(unavailableProviders);

        const choice = await askSkipOrRetry(rl);
        if (choice === 'skip') {
          console.log('\nSetup skipped. Install a provider and run this wizard again.\n');
          saveWizardCheckpoint({
            checkpointStage: 'detected',
            configuredProviderIds,
            pendingProviders: [],
            detectedProviders: [],
          });

          rl.close();
          return;
        }

        console.log('\nRetrying provider detection...\n');
      } else {
        saveWizardCheckpoint({
          checkpointStage: shouldAskContinue ? 'detected' : savedState?.checkpointStage || 'selection',
          configuredProviderIds,
          pendingProviders: availableProviders.map((provider) => provider.id),
          detectedProviders: detectedProviderIds,
        });
        shouldRetryDetection = false;
      }
    }

    if (shouldAskContinue) {
      const shouldContinue = await askYesNo(rl, 'Would you like to continue with setup?');
      if (!shouldContinue) {
        console.log('\nSetup cancelled. Run this wizard again when you are ready.\n');
        saveWizardCheckpoint({
          checkpointStage: 'detected',
          configuredProviderIds,
          pendingProviders: availableProviders.map((provider) => provider.id),
          detectedProviders: detectedProviderIds,
        });
        rl.close();
        return;
      }

      saveWizardCheckpoint({
        checkpointStage: 'selection',
        configuredProviderIds,
        pendingProviders: availableProviders.map((provider) => provider.id),
        detectedProviders: detectedProviderIds,
      });
    } else {
      console.log(`Continuing from saved ${describeCheckpointStage(savedState.checkpointStage)} checkpoint.\n`);
    }

    let configuredCount = configuredProviderIds.length;
    let shouldConfigureMore = true;

    if (savedState && configuredCount > 0) {
      console.log(`Previously configured ${configuredCount} provider(s)\n`);
    }

    if (availableProviders.length === 0) {
      console.log('All detected providers are already accounted for in this wizard session.\n');
    }

    while (shouldConfigureMore && availableProviders.length > 0) {
      const selectedProvider = await askSelectProvider(rl, availableProviders);

      if (!selectedProvider) {
        console.log('\nSkipping provider selection.\n');
        break;
      }

      saveWizardCheckpoint({
        checkpointStage: 'configuration',
        configuredProviderIds,
        pendingProviders: availableProviders.map((provider) => provider.id),
        detectedProviders: detectedProviderIds,
        currentProvider: selectedProvider.id,
      });

      const success = configureProvider(selectedProvider);
      if (success) {
        configuredCount++;
        if (!configuredProviderIds.includes(selectedProvider.id)) {
          configuredProviderIds.push(selectedProvider.id);
        }
      }

      if (success) {
        const index = availableProviders.findIndex((provider) => provider.id === selectedProvider.id);
        if (index !== -1) {
          availableProviders.splice(index, 1);
        }

        saveWizardCheckpoint({
          checkpointStage: availableProviders.length > 0 ? 'selection' : 'tutorial_offer',
          configuredProviderIds,
          pendingProviders: availableProviders.map((provider) => provider.id),
          detectedProviders: detectedProviderIds,
        });
      } else {
        saveWizardCheckpoint({
          checkpointStage: 'selection',
          configuredProviderIds,
          pendingProviders: availableProviders.map((provider) => provider.id),
          detectedProviders: detectedProviderIds,
        });
      }

      if (availableProviders.length > 0) {
        shouldConfigureMore = await askYesNo(rl, 'Would you like to configure another provider?');
      } else {
        shouldConfigureMore = false;
      }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`Setup complete. Processed ${configuredCount} provider(s).`);
    console.log('='.repeat(50) + '\n');

    saveWizardCheckpoint({
      checkpointStage: 'tutorial_offer',
      configuredProviderIds,
      pendingProviders: [],
      detectedProviders: detectedProviderIds,
    });

    const wantsTutorial = await askYesNo(rl, 'Would you like to run the interactive tutorial?');
    if (wantsTutorial) {
      rl.close();
      console.log('');
      await runTutorial({ skipPrompt: true });
    }

    if (!isDryRun) {
      try {
        clearState();
      } catch (error) {
        console.error('Failed to clear wizard state:', error.message);
      }
    }
  } catch (error) {
    console.error('\nError during setup:', error.message);
    process.exit(1);
  } finally {
    rl.close();
  }
}

function formatReadinessLabel(readiness) {
  switch (readiness) {
    case 'ready':
      return 'ready';
    case 'needs_setup':
      return 'needs setup';
    default:
      return 'unavailable';
  }
}

async function main() {
  try {
    await runWizard();
  } catch (error) {
    console.error('\nFatal error:', error.message);
    process.exit(1);
  }
}

main();
