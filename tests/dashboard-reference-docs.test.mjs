import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  getDashboardHttpPath,
  listDashboardDesktopIpcMethods,
  listDashboardHttpEndpoints,
} from '../src/contracts/dashboard-schemas.js';
import {
  buildDashboardDesktopReference,
  writeDashboardDesktopReference,
} from '../src/docs/dashboard-reference.js';

test('dashboard surface manifest exposes canonical endpoints, params, and IPC methods', () => {
  const endpoints = listDashboardHttpEndpoints();
  const ipcMethods = listDashboardDesktopIpcMethods();

  assert.ok(endpoints.some((entry) => entry.id === 'state' && entry.path === '/api/state'));
  assert.ok(endpoints.some((entry) => entry.id === 'terminalSessionInput' && entry.aliases.includes('/api/terminal/session/:sessionId/input')));
  assert.equal(getDashboardHttpPath('terminalSessionStream', { sessionId: 'abc 123' }), '/api/terminal/session/abc%20123/stream');
  assert.equal(ipcMethods.length, 2);
  assert.ok(ipcMethods.some((entry) => entry.api === 'ctxApi.getTerminalAllowlist'));
});

test('buildDashboardDesktopReference exports code-backed dashboard and desktop baseline', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-dashboard-reference-build-'));
  mkdirSync(join(rootDir, 'ctx-app'), { recursive: true });

  writeFileSync(join(rootDir, 'ctx-app', 'package.json'), JSON.stringify({
    name: 'ctx-app',
    version: '1.2.3',
    main: 'dist-electron/main.js',
  }), 'utf8');

  const artifact = buildDashboardDesktopReference({
    rootDir,
    now: '2026-03-11T14:00:00.000Z',
  });

  assert.equal(artifact.desktop.runtime.name, 'ctx-app');
  assert.equal(artifact.desktop.runtime.version, '1.2.3');
  assert.equal(artifact.desktop.navigation.defaultTab, 'command');
  assert.ok(artifact.desktop.navigation.tabs.some((tab) => tab.id === 'terminal'));
  assert.ok(artifact.desktop.shellSummaryContract.topLevelFields.includes('providers'));
  assert.equal(artifact.desktop.ipc.summary.total, 2);
  assert.ok(artifact.dashboard.summary.total >= 30);
  assert.equal(artifact.dashboard.summary.public, 1);
  assert.ok(artifact.dashboard.endpoints.some((entry) => entry.clientMethod === 'getState'));
});

test('writeDashboardDesktopReference writes a schema-valid JSON artifact', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-dashboard-reference-write-'));
  mkdirSync(join(rootDir, 'ctx-app'), { recursive: true });

  writeFileSync(join(rootDir, 'ctx-app', 'package.json'), JSON.stringify({
    name: 'ctx-app',
    version: '1.2.3',
    main: 'dist-electron/main.js',
  }), 'utf8');

  const artifact = writeDashboardDesktopReference({
    rootDir,
    outputPath: 'docs/reference/dashboard/dashboard-desktop-surface.json',
    now: '2026-03-11T14:00:00.000Z',
  });

  const persisted = JSON.parse(
    readFileSync(join(rootDir, 'docs', 'reference', 'dashboard', 'dashboard-desktop-surface.json'), 'utf8')
  );

  assert.equal(persisted.dashboard.summary.total, artifact.dashboard.summary.total);
  assert.equal(persisted.desktop.ipc.summary.total, artifact.desktop.ipc.summary.total);
});

test('CLI writes dashboard desktop reference artifact for a real node invocation', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-dashboard-reference-cli-'));
  mkdirSync(join(rootDir, 'ctx-app'), { recursive: true });

  writeFileSync(join(rootDir, 'ctx-app', 'package.json'), JSON.stringify({
    name: 'ctx-app',
    version: '1.2.3',
    main: 'dist-electron/main.js',
  }), 'utf8');

  const scriptPath = resolve('src/docs/dashboard-reference.js');
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--write', 'docs/reference/dashboard/dashboard-desktop-surface.json'],
    {
      cwd: rootDir,
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const persisted = JSON.parse(
    readFileSync(join(rootDir, 'docs', 'reference', 'dashboard', 'dashboard-desktop-surface.json'), 'utf8')
  );
  assert.equal(persisted.desktop.runtime.shell, 'electron');
  assert.ok(persisted.dashboard.summary.total >= 30);
});

test('desktop client uses Electron IPC for terminal commands instead of undocumented HTTP routes', () => {
  const source = readFileSync(resolve('ctx-app/src/api/client.ts'), 'utf8');

  assert.match(source, /terminalBridge\?\.getTerminalAllowlist/);
  assert.match(source, /terminalBridge\?\.runTerminalCommand/);
  assert.match(source, /getDashboardHttpPath\('state'\)/);
  assert.doesNotMatch(source, /\/api\/terminal\/allowlist/);
  assert.doesNotMatch(source, /\/api\/terminal\/run/);
});
