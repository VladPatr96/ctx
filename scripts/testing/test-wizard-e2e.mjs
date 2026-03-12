#!/usr/bin/env node

/**
 * End-to-end verification test for ctx-wizard.
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
import { existsSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..', '..');
const NODE_BIN = process.execPath;
const SANDBOXES = new Set();

// ANSI color codes
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

/**
 * Log a test result.
 * @param {boolean} passed
 * @param {string} message
 */
function logTest(passed, message) {
  const icon = passed ? '[PASS]' : '[FAIL]';
  const color = passed ? GREEN : RED;
  console.log(`${color}${icon}${RESET} ${message}`);
}

function createSandbox() {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-wizard-e2e-'));
  const homeDir = join(rootDir, 'home');
  const dataDir = join(rootDir, 'data');
  const appDataDir = join(homeDir, 'AppData', 'Roaming');
  const localAppDataDir = join(homeDir, 'AppData', 'Local');
  const tempDir = join(rootDir, 'tmp');
  const systemRoot = process.env.SystemRoot || process.env.WINDIR || 'C:\\Windows';

  mkdirSync(homeDir, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(appDataDir, { recursive: true });
  mkdirSync(localAppDataDir, { recursive: true });
  mkdirSync(tempDir, { recursive: true });
  mkdirSync(join(homeDir, '.codex'), { recursive: true });

  const sandbox = {
    rootDir,
    dataDir,
    env: {
      PATH: dirname(NODE_BIN),
      HOME: homeDir,
      USERPROFILE: homeDir,
      APPDATA: appDataDir,
      LOCALAPPDATA: localAppDataDir,
      CTX_DATA_DIR: dataDir,
      TEMP: tempDir,
      TMP: tempDir,
      SystemRoot: systemRoot,
      WINDIR: systemRoot,
      ComSpec: process.env.ComSpec || join(systemRoot, 'System32', 'cmd.exe'),
      PATHEXT: process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD'
    },
    cleanup() {
      if (!SANDBOXES.has(sandbox)) {
        return;
      }
      SANDBOXES.delete(sandbox);
      rmSync(rootDir, { recursive: true, force: true });
    }
  };

  SANDBOXES.add(sandbox);
  return sandbox;
}

async function withSandbox(fn) {
  const sandbox = createSandbox();
  try {
    return await fn(sandbox);
  } finally {
    sandbox.cleanup();
  }
}

process.on('exit', () => {
  for (const sandbox of [...SANDBOXES]) {
    sandbox.cleanup();
  }
});

/**
 * Run a command and capture output.
 * @param {string} cmd
 * @param {string[]} args
 * @param {string} input
 * @param {number} timeout
 * @param {{ env?: Record<string, string> }} options
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
function runCommand(cmd, args, input = '', timeout = 10000, options = {}) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: ROOT_DIR,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: options.env
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

    proc.stdin.on('error', () => {});

    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: timedOut ? -1 : (code || 0)
      });
    });

    if (input) {
      proc.stdin.write(input);
      proc.stdin.end();
    }
  });
}

/**
 * Run a command and send inputs with delays.
 * @param {string} cmd
 * @param {string[]} args
 * @param {string[]} inputs
 * @param {number} timeout
 * @param {number} inputDelay
 * @param {{ env?: Record<string, string> }} options
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
function runCommandWithDelays(cmd, args, inputs, timeout = 10000, inputDelay = 1000, options = {}) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: ROOT_DIR,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: options.env
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timer = null;
    const inputTimers = [];

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

    proc.stdin.on('error', () => {});

    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);
      inputTimers.forEach(clearTimeout);
      resolve({
        stdout,
        stderr,
        exitCode: timedOut ? -1 : (code || 0)
      });
    });

    let delay = inputDelay;
    for (const input of inputs) {
      inputTimers.push(setTimeout(() => {
        if (proc.exitCode === null && proc.stdin.writable) {
          proc.stdin.write(`${input}\n`);
        }
      }, delay));
      delay += inputDelay;
    }

    inputTimers.push(setTimeout(() => {
      if (proc.stdin.writable) {
        proc.stdin.end();
      }
    }, delay + 500));
  });
}

/**
 * Run an interactive command by waiting for prompts before sending input.
 * This avoids fixed-delay flakes when the machine is under load.
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ waitFor: string, input: string }[]} steps
 * @param {number} timeout
 * @param {{ env?: Record<string, string> }} options
 * @returns {Promise<{stdout: string, stderr: string, exitCode: number}>}
 */
function runCommandByPrompts(cmd, args, steps, timeout = 10000, options = {}) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: ROOT_DIR,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: options.env,
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let timer = null;
    let stepIndex = 0;
    let promptCursor = 0;
    let stdinClosed = false;

    if (timeout > 0) {
      timer = setTimeout(() => {
        timedOut = true;
        proc.kill('SIGTERM');
      }, timeout);
    }

    const maybeAdvance = () => {
      while (stepIndex < steps.length) {
        const step = steps[stepIndex];
        const matchIndex = stdout.indexOf(step.waitFor, promptCursor);
        if (matchIndex === -1) {
          return;
        }

        promptCursor = matchIndex + step.waitFor.length;
        if (proc.exitCode === null && proc.stdin.writable) {
          proc.stdin.write(`${step.input}\n`);
        }
        stepIndex++;
      }

      if (!stdinClosed) {
        stdinClosed = true;
        setTimeout(() => {
          if (proc.stdin.writable) {
            proc.stdin.end();
          }
        }, 150);
      }
    };

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
      maybeAdvance();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.stdin.on('error', () => {});

    proc.on('close', (code) => {
      if (timer) clearTimeout(timer);
      resolve({
        stdout,
        stderr,
        exitCode: timedOut ? -1 : (code || 0),
      });
    });
  });
}

async function getAvailableProviderCount(env) {
  const script = [
    "import { detectProviders } from './scripts/setup/provider-detector.js';",
    "console.log(detectProviders().filter((provider) => provider.available).length);"
  ].join(' ');

  const result = await runCommand(
    NODE_BIN,
    ['--input-type=module', '-e', script],
    '',
    5000,
    { env }
  );

  const count = Number.parseInt(result.stdout.trim(), 10);
  return Number.isInteger(count) ? count : 0;
}

function buildSetupInputs(providerCount, tutorialAnswer, tutorialInputs = []) {
  const inputs = ['y', '0'];
  if (providerCount > 1) {
    inputs.push('n');
  }
  inputs.push(tutorialAnswer, ...tutorialInputs);
  return inputs;
}

function buildSetupSteps(providerCount, tutorialAnswer, tutorialSteps = []) {
  const steps = [
    {
      waitFor: 'Would you like to continue with setup?',
      input: 'y',
    },
    {
      waitFor: 'Select a provider by number',
      input: '0',
    },
  ];

  if (providerCount > 1) {
    steps.push({
      waitFor: 'Would you like to configure another provider?',
      input: 'n',
    });
  }

  steps.push({
    waitFor: 'Would you like to run the interactive tutorial?',
    input: tutorialAnswer,
  });

  for (const step of tutorialSteps) {
    steps.push(step);
  }

  return steps;
}

function buildEarlyExitSteps(providerCount) {
  if (providerCount > 0) {
    return [
      {
        waitFor: 'Would you like to continue with setup?',
        input: 'n',
      },
    ];
  }

  return [
    {
      waitFor: 'Would you like to (s)kip setup or (r)etry detection?',
      input: 's',
    },
  ];
}

/**
 * Test 1: Wizard runs without arguments
 */
async function testWizardLaunches() {
  return withSandbox(async (sandbox) => {
    console.log(`\n${BOLD}Test 1: Wizard launches without arguments${RESET}`);

    const providerCount = await getAvailableProviderCount(sandbox.env);
    const result = await runCommandByPrompts(
      NODE_BIN,
      ['scripts/ctx-wizard.js', '--dry-run'],
      buildEarlyExitSteps(providerCount),
      10000,
      { env: sandbox.env }
    );

    const hasWelcome = result.stdout.includes('Welcome to CTX Setup Wizard');
    const hasDryRunNotice = result.stdout.includes('DRY RUN MODE');

    logTest(hasWelcome, 'Wizard displays welcome message');
    logTest(hasDryRunNotice, 'Dry-run mode activates correctly');

    return hasWelcome && hasDryRunNotice;
  });
}

/**
 * Test 2: Wizard detects providers automatically
 */
async function testProviderDetection() {
  return withSandbox(async (sandbox) => {
    console.log(`\n${BOLD}Test 2: Provider detection${RESET}`);

    const providerCount = await getAvailableProviderCount(sandbox.env);
    const result = await runCommandByPrompts(
      NODE_BIN,
      ['scripts/ctx-wizard.js', '--dry-run'],
      buildEarlyExitSteps(providerCount),
      10000,
      { env: sandbox.env }
    );

    const hasDetection = result.stdout.includes('Provider Detection Results');
    const hasProviders = result.stdout.includes('Claude Code') ||
      result.stdout.includes('Codex CLI') ||
      result.stdout.includes('Gemini CLI') ||
      result.stdout.includes('OpenCode');

    logTest(hasDetection, 'Provider detection runs automatically');
    logTest(hasProviders, 'At least one provider is detected');

    return hasDetection && hasProviders;
  });
}

/**
 * Test 3: Provider configuration flow
 */
async function testProviderConfiguration() {
  return withSandbox(async (sandbox) => {
    console.log(`\n${BOLD}Test 3: Provider configuration flow${RESET}`);

    const providerCount = await getAvailableProviderCount(sandbox.env);
    const result = await runCommandByPrompts(
      NODE_BIN,
      ['scripts/ctx-wizard.js', '--dry-run'],
      buildSetupSteps(providerCount, 'n'),
      15000,
      { env: sandbox.env }
    );

    const hasProviderList = result.stdout.includes('Available providers');
    const hasConfiguration = result.stdout.includes('[DRY RUN] Would configure') ||
      result.stdout.includes('configured successfully');
    const hasCompletion = result.stdout.includes('Setup complete');

    logTest(hasProviderList, 'Provider selection list appears');
    logTest(hasConfiguration, 'Provider configuration runs');
    logTest(hasCompletion, 'Setup completion message shows');

    return hasProviderList && hasConfiguration && hasCompletion;
  });
}

/**
 * Test 4: Tutorial offer appears
 */
async function testTutorialOffer() {
  return withSandbox(async (sandbox) => {
    console.log(`\n${BOLD}Test 4: Tutorial offer${RESET}`);

    const providerCount = await getAvailableProviderCount(sandbox.env);
    const result = await runCommandByPrompts(
      NODE_BIN,
      ['scripts/ctx-wizard.js', '--dry-run'],
      buildSetupSteps(providerCount, 'n'),
      15000,
      { env: sandbox.env }
    );

    const hasTutorialPrompt = result.stdout.includes('Would you like to run the interactive tutorial?');

    logTest(hasTutorialPrompt, 'Tutorial prompt appears after setup');

    return hasTutorialPrompt;
  });
}

/**
 * Test 5: Tutorial completes successfully
 */
async function testTutorialCompletion() {
  return withSandbox(async (sandbox) => {
    console.log(`\n${BOLD}Test 5: Tutorial completion${RESET}`);

    const providerCount = await getAvailableProviderCount(sandbox.env);
    const result = await runCommandByPrompts(
      NODE_BIN,
      ['scripts/ctx-wizard.js', '--dry-run'],
      buildSetupSteps(providerCount, 'y', [
        { waitFor: 'Press Enter to continue...', input: '' },
        { waitFor: 'Press Enter to continue...', input: '' },
        { waitFor: 'Press Enter to continue...', input: '' },
        { waitFor: 'Press Enter to continue...', input: '' },
      ]),
      30000,
      { env: sandbox.env }
    );

    const tutorialStarts = result.stdout.includes('Welcome to the CTX Interactive Tutorial!');
    const tutorialCompletes = result.stdout.includes('Tutorial Complete!') &&
      result.stdout.includes('Happy coding with CTX!');
    const exitedCleanly = result.exitCode === 0;

    logTest(tutorialStarts, 'Tutorial starts when accepted');
    logTest(tutorialCompletes, 'Tutorial completes successfully');
    logTest(exitedCleanly, 'Tutorial flow exits cleanly');

    return tutorialStarts && tutorialCompletes && exitedCleanly;
  });
}

/**
 * Test 6: State persistence and resume functionality
 */
async function testStatePersistence() {
  return withSandbox(async (sandbox) => {
    console.log(`\n${BOLD}Test 6: State persistence and resume${RESET}`);

    const stateFile = join(sandbox.dataDir, 'wizard-state.json');
    const mockState = {
      version: 1,
      checkpointStage: 'selection',
      configuredProviders: ['claude'],
      pendingProviders: ['codex'],
      detectedProviders: ['claude', 'codex'],
      currentProvider: null,
      lastUpdated: new Date().toISOString(),
    };

    writeFileSync(stateFile, JSON.stringify(mockState, null, 2), 'utf-8');

    const stateCreated = existsSync(stateFile);
    logTest(stateCreated, 'Wizard state file created (mocked for testing)');

    const result = await runCommandWithDelays(
      NODE_BIN,
      ['scripts/ctx-wizard.js'],
      ['r', '0', 'n', 'n'],
      12000,
      1000,
      { env: sandbox.env }
    );

    const hasResumePrompt = result.stdout.includes('Previous wizard session detected');
    const hasResumeCheckpoint = result.stdout.includes('Resume checkpoint: provider selection') &&
      result.stdout.includes('Continuing from saved provider selection checkpoint');
    const skipsGenericContinue = !result.stdout.includes('Would you like to continue with setup?');
    const stateCleared = !existsSync(stateFile);

    logTest(hasResumePrompt, 'Resume prompt appears on restart');
    logTest(hasResumeCheckpoint, 'Resume checkpoint summary appears');
    logTest(skipsGenericContinue, 'Resume continues from checkpoint without generic setup prompt');
    logTest(stateCleared, 'Wizard state clears after successful resume flow');

    return stateCreated && hasResumePrompt && hasResumeCheckpoint && skipsGenericContinue && stateCleared;
  });
}

/**
 * Test 7: Skip/retry functionality for missing providers
 */
async function testSkipRetry() {
  return withSandbox(async (sandbox) => {
    console.log(`\n${BOLD}Test 7: Skip/retry functionality${RESET}`);

    const providerCount = await getAvailableProviderCount(sandbox.env);
    const result = await runCommandByPrompts(
      NODE_BIN,
      ['scripts/ctx-wizard.js', '--dry-run'],
      buildEarlyExitSteps(providerCount),
      10000,
      { env: sandbox.env }
    );

    const hasProviderInfo = result.stdout.includes('Provider Detection Results');
    const handlesGracefully = providerCount > 0
      ? !result.stderr.includes('Error')
      : result.stdout.includes('Installation Instructions') || result.stdout.includes('Setup skipped');

    logTest(hasProviderInfo, 'Provider detection completes');
    logTest(handlesGracefully, 'Handles missing providers gracefully');

    return hasProviderInfo && handlesGracefully;
  });
}

/**
 * Test 8: Help text and documentation
 */
async function testHelpText() {
  return withSandbox(async (sandbox) => {
    console.log(`\n${BOLD}Test 8: Help and documentation${RESET}`);

    const result = await runCommand(
      NODE_BIN,
      ['scripts/ctx-setup.js', '--help'],
      '',
      8000,
      { env: sandbox.env }
    );

    const combinedOutput = `${result.stdout}\n${result.stderr}`;
    const hasHelp = combinedOutput.includes('Usage') || combinedOutput.toLowerCase().includes('interactive');
    const mentionsWizard = combinedOutput.toLowerCase().includes('wizard') || combinedOutput.toLowerCase().includes('interactive');

    logTest(hasHelp, 'ctx-setup.js shows help text');
    logTest(mentionsWizard, 'Help mentions interactive/wizard mode');

    return hasHelp && mentionsWizard;
  });
}

/**
 * Test 9: Integration with ctx-setup.js
 */
async function testCtxSetupIntegration() {
  return withSandbox(async (sandbox) => {
    console.log(`\n${BOLD}Test 9: Integration with ctx-setup.js${RESET}`);

    const providerCount = await getAvailableProviderCount(sandbox.env);
    const inputs = buildSetupInputs(providerCount, 'n');
    const result = await runCommandWithDelays(
      NODE_BIN,
      ['scripts/ctx-setup.js', '--interactive'],
      inputs,
      12000,
      1000,
      { env: sandbox.env }
    );

    const wizardLaunches = result.stdout.includes('Welcome to CTX Setup Wizard') ||
      result.stdout.includes('CTX');

    logTest(wizardLaunches, '--interactive flag launches wizard');

    return wizardLaunches;
  });
}

/**
 * Test 10: Error handling
 */
async function testErrorHandling() {
  return withSandbox(async (sandbox) => {
    console.log(`\n${BOLD}Test 10: Error handling${RESET}`);

    const providerCount = await getAvailableProviderCount(sandbox.env);
    const result = providerCount > 0
      ? await runCommandByPrompts(
          NODE_BIN,
          ['scripts/ctx-wizard.js', '--dry-run'],
          [
            { waitFor: 'Would you like to continue with setup?', input: 'y' },
            { waitFor: 'Select a provider by number', input: 'invalid' },
            { waitFor: 'Select a provider by number', input: '0' },
            ...(providerCount > 1 ? [{ waitFor: 'Would you like to configure another provider?', input: 'n' }] : []),
            { waitFor: 'Would you like to run the interactive tutorial?', input: 'n' },
          ],
          15000,
          { env: sandbox.env }
        )
      : await runCommandByPrompts(
          NODE_BIN,
          ['scripts/ctx-wizard.js', '--dry-run'],
          [
            { waitFor: 'Would you like to (s)kip setup or (r)etry detection?', input: 'invalid' },
            { waitFor: 'Would you like to (s)kip setup or (r)etry detection?', input: 's' },
          ],
          10000,
          { env: sandbox.env }
        );

    const handlesInvalid = !result.stderr.includes('Fatal') && (
      result.stdout.includes('Invalid selection. Please try again.')
      || result.stdout.includes('Invalid choice. Please enter "s" to skip or "r" to retry.')
      || result.stdout.includes('Setup skipped')
    );

    logTest(handlesInvalid, 'Handles invalid input gracefully');

    return handlesInvalid;
  });
}

/**
 * Main test runner
 */
async function runAllTests() {
  console.log(`${BOLD}${YELLOW}
+----------------------------------------------------------------+
|         CTX Wizard End-to-End Verification Tests               |
+----------------------------------------------------------------+
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

  console.log(`\n${BOLD}${YELLOW}${'-'.repeat(64)}${RESET}`);
  console.log(`${BOLD}Test Summary${RESET}\n`);

  const passed = results.filter((result) => result.passed).length;
  const total = results.length;
  const percentage = Math.round((passed / total) * 100);

  results.forEach((result) => {
    const icon = result.passed ? `${GREEN}[PASS]${RESET}` : `${RED}[FAIL]${RESET}`;
    console.log(`  ${icon} ${result.name}`);
  });

  console.log(`\n${BOLD}Results: ${passed}/${total} tests passed (${percentage}%)${RESET}`);

  if (passed === total) {
    console.log(`${GREEN}${BOLD}\nAll tests passed. Wizard is ready for use.${RESET}\n`);
    process.exit(0);
  }

  console.log(`${RED}${BOLD}\nSome tests failed. Review the output above.${RESET}\n`);
  process.exit(1);
}

runAllTests().catch((error) => {
  console.error(`${RED}Fatal error during test execution:${RESET}`, error);
  process.exit(1);
});
