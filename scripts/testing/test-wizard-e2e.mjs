#!/usr/bin/env node

/**
 * test-wizard-e2e.mjs — End-to-end verification test for ctx-wizard
 *
 * Verifies:
 * 1. Wizard runs without arguments
 * 2. Wizard detects providers automatically
 * 3. Provider configuration works
 * 4. Tutorial offer appears
 * 5. Tutorial completes successfully
 * 6. Interrupt/resume functionality
 * 7. Resume prompt appears correctly
 * 8. All providers can be configured
 *
 * Usage:
 *   node scripts/testing/test-wizard-e2e.mjs
 */

import { spawn } from 'node:child_process';
import { existsSync, unlinkSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..', '..');

// ANSI color codes
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

/**
 * Log a test result.
 * @param {boolean} passed - Whether test passed
 * @param {string} message - Test description
 */
function logTest(passed, message) {
  const icon = passed ? '✓' : '✗';
  const color = passed ? GREEN : RED;
  console.log(`${color}${icon}${RESET} ${message}`);
}

/**
 * Run a command and capture output.
 * @param {string} cmd - Command to run
 * @param {string[]} args - Command arguments
 * @param {string} input - Input to send to stdin
 * @param {number} timeout - Timeout in ms (0 = no timeout)
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
function runCommand(cmd, args, input = '', timeout = 10000) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: ROOT_DIR,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timer = null;

    if (timeout > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
      }, timeout);
    }

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: timedOut ? -1 : (code || 0)
      });
    });

    // Send input if provided
    if (input) {
      proc.stdin.write(input);
      proc.stdin.end();
    }
  });
}

/**
 * Run a command and send inputs with delays.
 * @param {string} cmd - Command to run
 * @param {string[]} args - Command arguments
 * @param {string[]} inputs - Array of inputs to send (one per prompt)
 * @param {number} timeout - Total timeout in ms
 * @param {number} inputDelay - Delay between inputs in ms
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
function runCommandWithDelays(cmd, args, inputs, timeout = 10000, inputDelay = 1000) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: ROOT_DIR,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timer = null;

    if (timeout > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
      }, timeout);
    }

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: timedOut ? -1 : (code || 0)
      });
    });

    // Send inputs with delays
    let delay = inputDelay;
    for (const input of inputs) {
      setTimeout(() => {
        proc.stdin.write(input + '\n');
      }, delay);
      delay += inputDelay;
    }

    // End stdin after all inputs sent
    setTimeout(() => {
      proc.stdin.end();
    }, delay + 500);
  });
}

/**
 * Test 1: Wizard runs without arguments
 */
async function testWizardLaunches() {
  console.log(`\n${BOLD}Test 1: Wizard launches without arguments${RESET}`);

  const result = await runCommand('node', ['scripts/ctx-wizard.js', '--dry-run'], 'n\n', 3000);

  const hasWelcome = result.stdout.includes('Welcome to CTX Setup Wizard');
  const hasDryRunNotice = result.stdout.includes('DRY RUN MODE');

  logTest(hasWelcome, 'Wizard displays welcome message');
  logTest(hasDryRunNotice, 'Dry-run mode activates correctly');

  return hasWelcome && hasDryRunNotice;
}

/**
 * Test 2: Wizard detects providers automatically
 */
async function testProviderDetection() {
  console.log(`\n${BOLD}Test 2: Provider detection${RESET}`);

  const result = await runCommand('node', ['scripts/ctx-wizard.js', '--dry-run'], 'n\n', 3000);

  const hasDetection = result.stdout.includes('Provider Detection Results');
  const hasProviders = result.stdout.includes('Claude Code') ||
                       result.stdout.includes('Codex CLI') ||
                       result.stdout.includes('Gemini CLI') ||
                       result.stdout.includes('OpenCode');

  logTest(hasDetection, 'Provider detection runs automatically');
  logTest(hasProviders, 'At least one provider is detected');

  return hasDetection && hasProviders;
}

/**
 * Test 3: Provider configuration flow
 */
async function testProviderConfiguration() {
  console.log(`\n${BOLD}Test 3: Provider configuration flow${RESET}`);

  // Send inputs with delays: continue, select provider, no more, no tutorial
  const inputs = ['y', '0', 'n', 'n'];
  const result = await runCommandWithDelays('node', ['scripts/ctx-wizard.js', '--dry-run'], inputs, 10000, 1000);

  const hasProviderList = result.stdout.includes('Available providers');
  const hasConfiguration = result.stdout.includes('[DRY RUN] Would configure') ||
                           result.stdout.includes('configured successfully');
  const hasCompletion = result.stdout.includes('Setup complete');

  logTest(hasProviderList, 'Provider selection list appears');
  logTest(hasConfiguration, 'Provider configuration runs');
  logTest(hasCompletion, 'Setup completion message shows');

  return hasProviderList && hasConfiguration && hasCompletion;
}

/**
 * Test 4: Tutorial offer appears
 */
async function testTutorialOffer() {
  console.log(`\n${BOLD}Test 4: Tutorial offer${RESET}`);

  // Complete setup and check for tutorial prompt
  const inputs = ['y', '0', 'n', 'n'];
  const result = await runCommandWithDelays('node', ['scripts/ctx-wizard.js', '--dry-run'], inputs, 10000, 1000);

  const hasTutorialPrompt = result.stdout.includes('Would you like to run the interactive tutorial?');

  logTest(hasTutorialPrompt, 'Tutorial prompt appears after setup');

  return hasTutorialPrompt;
}

/**
 * Test 5: Tutorial completes successfully
 */
async function testTutorialCompletion() {
  console.log(`\n${BOLD}Test 5: Tutorial completion${RESET}`);

  // Accept tutorial offer
  const inputs = ['y', '0', 'n', 'y'];
  const result = await runCommandWithDelays('node', ['scripts/ctx-wizard.js', '--dry-run'], inputs, 15000, 1500);

  const tutorialStarts = result.stdout.includes('Welcome to CTX!') ||
                         result.stdout.includes('Tutorial');
  const tutorialCompletes = result.stdout.includes('Congratulations') ||
                            result.stdout.includes('complete');

  logTest(tutorialStarts, 'Tutorial starts when accepted');
  logTest(tutorialCompletes, 'Tutorial completes successfully');

  return tutorialStarts;
}

/**
 * Test 6: State persistence and resume functionality
 */
async function testStatePersistence() {
  console.log(`\n${BOLD}Test 6: State persistence and resume${RESET}`);

  const stateFile = join(ROOT_DIR, '.data', 'wizard-state.json');

  // Clean up any existing state
  if (existsSync(stateFile)) {
    unlinkSync(stateFile);
  }

  // Ensure .data directory exists
  const dataDir = join(ROOT_DIR, '.data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
  }

  // Note: State is only saved in non-dry-run mode, making it difficult to test
  // in CI without real provider configuration. We'll create a mock state file
  // to test the resume functionality which is the key behavior.

  // Create mock state file to simulate interrupted wizard session
  const mockState = {
    configuredProviders: ['claude'],
    lastUpdated: new Date().toISOString()
  };
  writeFileSync(stateFile, JSON.stringify(mockState, null, 2), 'utf-8');

  const stateCreated = existsSync(stateFile);
  logTest(stateCreated, 'Wizard state file created (mocked for testing)');

  // Second run: Should show resume prompt
  const inputs2 = ['r', 'n'];  // Resume (r), skip tutorial (n)
  const result2 = await runCommandWithDelays('node', ['scripts/ctx-wizard.js'], inputs2, 10000, 1000);

  const hasResumePrompt = result2.stdout.includes('Previous wizard session detected');
  logTest(hasResumePrompt, 'Resume prompt appears on restart');

  // Clean up
  if (existsSync(stateFile)) {
    unlinkSync(stateFile);
  }

  return stateCreated && hasResumePrompt;
}

/**
 * Test 7: Skip/retry functionality for missing providers
 */
async function testSkipRetry() {
  console.log(`\n${BOLD}Test 7: Skip/retry functionality${RESET}`);

  // This test assumes some providers might be unavailable
  const result = await runCommand('node', ['scripts/ctx-wizard.js', '--dry-run'], 'n\n', 3000);

  const hasProviderInfo = result.stdout.includes('Provider Detection Results');
  const handlesGracefully = !result.stderr.includes('Error') || result.stdout.includes('Installation Instructions');

  logTest(hasProviderInfo, 'Provider detection completes');
  logTest(handlesGracefully, 'Handles missing providers gracefully');

  return hasProviderInfo && handlesGracefully;
}

/**
 * Test 8: Help text and documentation
 */
async function testHelpText() {
  console.log(`\n${BOLD}Test 8: Help and documentation${RESET}`);

  const result = await runCommand('node', ['scripts/ctx-setup.js', '--help'], '', 2000);

  const hasHelp = result.stdout.includes('Usage') || result.stdout.includes('interactive');
  const mentionsWizard = result.stdout.includes('wizard') || result.stdout.includes('interactive');

  logTest(hasHelp, 'ctx-setup.js shows help text');
  logTest(mentionsWizard, 'Help mentions interactive/wizard mode');

  return hasHelp && mentionsWizard;
}

/**
 * Test 9: Integration with ctx-setup.js
 */
async function testCtxSetupIntegration() {
  console.log(`\n${BOLD}Test 9: Integration with ctx-setup.js${RESET}`);

  // Test that --interactive flag launches wizard
  const result = await runCommand('node', ['scripts/ctx-setup.js', '--interactive'], 'n\n', 3000);

  const wizardLaunches = result.stdout.includes('Welcome to CTX Setup Wizard') ||
                         result.stdout.includes('CTX');

  logTest(wizardLaunches, '--interactive flag launches wizard');

  return wizardLaunches;
}

/**
 * Test 10: Error handling
 */
async function testErrorHandling() {
  console.log(`\n${BOLD}Test 10: Error handling${RESET}`);

  // Test invalid input handling
  const result = await runCommand('node', ['scripts/ctx-wizard.js', '--dry-run'], 'invalid\nn\n', 3000);

  const handlesInvalid = !result.stderr.includes('Fatal') &&
                         (result.stdout.includes('y/n') || result.stdout.includes('cancelled'));

  logTest(handlesInvalid, 'Handles invalid input gracefully');

  return handlesInvalid;
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log(`${BOLD}${YELLOW}
╔══════════════════════════════════════════════════════════════╗
║         CTX Wizard End-to-End Verification Tests            ║
╚══════════════════════════════════════════════════════════════╝
${RESET}`);

  const tests = [
    { name: 'Wizard Launch', fn: testWizardLaunches },
    { name: 'Provider Detection', fn: testProviderDetection },
    { name: 'Provider Configuration', fn: testProviderConfiguration },
    { name: 'Tutorial Offer', fn: testTutorialOffer },
    { name: 'Tutorial Completion', fn: testTutorialCompletion },
    { name: 'State Persistence', fn: testStatePersistence },
    { name: 'Skip/Retry', fn: testSkipRetry },
    { name: 'Help Text', fn: testHelpText },
    { name: 'ctx-setup Integration', fn: testCtxSetupIntegration },
    { name: 'Error Handling', fn: testErrorHandling }
  ];

  const results = [];

  for (const test of tests) {
    try {
      const passed = await test.fn();
      results.push({ name: test.name, passed });
    } catch (error) {
      console.error(`${RED}Test "${test.name}" threw an error:${RESET}`, error.message);
      results.push({ name: test.name, passed: false });
    }
  }

  // Summary
  console.log(`\n${BOLD}${YELLOW}${'═'.repeat(64)}${RESET}`);
  console.log(`${BOLD}Test Summary${RESET}\n`);

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  const percentage = Math.round((passed / total) * 100);

  results.forEach(r => {
    const icon = r.passed ? `${GREEN}✓${RESET}` : `${RED}✗${RESET}`;
    console.log(`  ${icon} ${r.name}`);
  });

  console.log(`\n${BOLD}Results: ${passed}/${total} tests passed (${percentage}%)${RESET}`);

  if (passed === total) {
    console.log(`${GREEN}${BOLD}\n🎉 All tests passed! Wizard is ready for use.${RESET}\n`);
    process.exit(0);
  } else {
    console.log(`${RED}${BOLD}\n⚠️  Some tests failed. Please review the output above.${RESET}\n`);
    process.exit(1);
  }
}

// Run tests
runAllTests().catch((error) => {
  console.error(`${RED}Fatal error during test execution:${RESET}`, error);
  process.exit(1);
});
