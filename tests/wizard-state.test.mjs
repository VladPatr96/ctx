import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  createWizardStateSnapshot,
  parseWizardState,
  reconcileWizardState,
} from '../src/contracts/provider-schemas.js';
import { loadState, saveState } from '../src/setup/state-manager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT_DIR = join(__dirname, '..');

function createSandbox() {
  const root = mkdtempSync(join(tmpdir(), 'ctx-wizard-state-'));
  const home = join(root, 'home');
  const dataDir = join(root, 'data');
  const appData = join(home, 'AppData', 'Roaming');
  const localAppData = join(home, 'AppData', 'Local');
  const tempDir = join(root, 'tmp');

  mkdirSync(home, { recursive: true });
  mkdirSync(dataDir, { recursive: true });
  mkdirSync(appData, { recursive: true });
  mkdirSync(localAppData, { recursive: true });
  mkdirSync(tempDir, { recursive: true });
  mkdirSync(join(home, '.codex'), { recursive: true });

  return {
    root,
    dataDir,
    env: {
      ...process.env,
      PATH: dirname(process.execPath),
      HOME: home,
      USERPROFILE: home,
      APPDATA: appData,
      LOCALAPPDATA: localAppData,
      CTX_DATA_DIR: dataDir,
      TEMP: tempDir,
      TMP: tempDir,
    },
    cleanup() {
      rmSync(root, { recursive: true, force: true });
    },
  };
}

function runCommandByPrompts(args, steps, options = {}) {
  return new Promise((resolve) => {
    const proc = spawn(process.execPath, args, {
      cwd: ROOT_DIR,
      env: options.env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let stepIndex = 0;

    const flushSteps = () => {
      while (stepIndex < steps.length && stdout.includes(steps[stepIndex].waitFor)) {
        if (proc.exitCode !== null || !proc.stdin.writable) {
          break;
        }
        proc.stdin.write(`${steps[stepIndex].input}\n`);
        stepIndex += 1;
      }
    };

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
      flushSteps();
    });

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.stdin.on('error', () => {});

    proc.on('close', (code) => {
      resolve({ status: code ?? 0, stdout, stderr });
    });
  });
}

test('parseWizardState migrates legacy state and normalizes provider queues', () => {
  const parsed = parseWizardState({
    configuredProviders: ['claude', 'claude'],
    pendingProviders: ['codex', 'claude', 'codex'],
    currentProvider: 'codex',
    lastUpdated: new Date().toISOString(),
  });

  assert.equal(parsed.version, 1);
  assert.equal(parsed.checkpointStage, 'selection');
  assert.deepEqual(parsed.configuredProviders, ['claude']);
  assert.deepEqual(parsed.pendingProviders, ['codex']);
  assert.equal(parsed.currentProvider, 'codex');
});

test('reconcileWizardState requeues interrupted provider and drops unavailable pending ids', () => {
  const state = createWizardStateSnapshot({
    checkpointStage: 'configuration',
    configuredProviders: ['claude'],
    pendingProviders: ['opencode'],
    currentProvider: 'codex',
    detectedProviders: ['claude', 'codex', 'opencode'],
    lastUpdated: new Date().toISOString(),
  });

  const reconciliation = reconcileWizardState(state, [
    { id: 'claude', available: true },
    { id: 'codex', available: true },
    { id: 'opencode', available: false },
  ]);

  assert.equal(reconciliation.state.checkpointStage, 'selection');
  assert.deepEqual(reconciliation.state.pendingProviders, ['codex']);
  assert.equal(reconciliation.state.currentProvider, null);
  assert.deepEqual(reconciliation.droppedPendingProviders, ['opencode']);
  assert.equal(reconciliation.requeuedProviderId, 'codex');
});

test('state-manager saves canonical wizard state and loads normalized snapshot', () => {
  const sandbox = createSandbox();
  try {
    saveState({
      configuredProviders: ['claude'],
      pendingProviders: ['codex'],
      lastUpdated: new Date().toISOString(),
    }, { dataDir: sandbox.dataDir });

    const statePath = join(sandbox.dataDir, 'wizard-state.json');
    assert.equal(existsSync(statePath), true);

    const rawState = JSON.parse(readFileSync(statePath, 'utf8'));
    assert.equal(rawState.version, 1);
    assert.equal(rawState.checkpointStage, 'selection');
    assert.deepEqual(rawState.pendingProviders, ['codex']);

    const loadedState = loadState({ dataDir: sandbox.dataDir });
    assert.equal(loadedState.version, 1);
    assert.deepEqual(loadedState.configuredProviders, ['claude']);
    assert.deepEqual(loadedState.pendingProviders, ['codex']);
  } finally {
    sandbox.cleanup();
  }
});

test('wizard resumes directly from saved selection checkpoint', async () => {
  const sandbox = createSandbox();
  try {
    const statePath = join(sandbox.dataDir, 'wizard-state.json');
    const snapshot = createWizardStateSnapshot({
      checkpointStage: 'selection',
      configuredProviders: ['claude'],
      pendingProviders: ['codex'],
      detectedProviders: ['claude', 'codex'],
      lastUpdated: new Date().toISOString(),
    });

    writeFileSync(statePath, JSON.stringify(snapshot, null, 2), 'utf8');

    const result = await runCommandByPrompts(
      ['scripts/ctx-wizard.js'],
      [
        { waitFor: 'Would you like to (r)esume or start (f)resh? (r/f):', input: 'r' },
        { waitFor: 'Select a provider by number (or press Enter to skip):', input: '0' },
        { waitFor: 'Would you like to run the interactive tutorial? (y/n):', input: 'n' },
      ],
      { env: sandbox.env }
    );

    assert.equal(result.status, 0);
    assert.match(result.stdout, /Resume checkpoint: provider selection/);
    assert.match(result.stdout, /Continuing from saved provider selection checkpoint/);
    assert.match(result.stdout, /Previously configured 1 provider\(s\)/);
    assert.doesNotMatch(result.stdout, /Would you like to continue with setup\?/);
    assert.equal(existsSync(statePath), false);
  } finally {
    sandbox.cleanup();
  }
});
