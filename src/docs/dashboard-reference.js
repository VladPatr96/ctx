import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  DEFAULT_SHELL_TAB,
  SHELL_SHORTCUTS,
  SHELL_TABS,
} from '../contracts/shell-navigation.js';
import { SHELL_CONNECTION_BUDGET } from '../contracts/shell-connection.js';
import {
  ShellProjectSummarySchema,
  ShellProviderCardSchema,
  ShellProvidersSummarySchema,
  ShellSessionSummarySchema,
  ShellStorageSummarySchema,
  ShellSummarySchema,
} from '../contracts/shell-schemas.js';
import {
  listDashboardDesktopIpcMethods,
  listDashboardHttpEndpoints,
} from '../contracts/dashboard-surface.js';
import { createDashboardDesktopReference } from '../contracts/dashboard-reference-schemas.js';

export function buildDashboardDesktopReference({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
} = {}) {
  const runtime = readDesktopRuntime(rootDir);
  const endpoints = listDashboardHttpEndpoints();
  const ipcMethods = listDashboardDesktopIpcMethods();

  return createDashboardDesktopReference({
    generatedAt: now,
    desktop: {
      runtime,
      navigation: {
        defaultTab: DEFAULT_SHELL_TAB,
        tabs: SHELL_TABS.map((tab) => ({ ...tab })),
        shortcuts: Object.entries(SHELL_SHORTCUTS).map(([key, shortcut]) => ({
          key,
          tab: shortcut.tab,
          focusTargetId: shortcut.focusTargetId || null,
        })),
      },
      connectionBudget: { ...SHELL_CONNECTION_BUDGET },
      shellSummaryContract: {
        topLevelFields: listFields(ShellSummarySchema),
        sessionFields: listFields(ShellSessionSummarySchema),
        projectFields: listFields(ShellProjectSummarySchema),
        storageFields: listFields(ShellStorageSummarySchema),
        providersFields: listFields(ShellProvidersSummarySchema),
        providerCardFields: listFields(ShellProviderCardSchema),
      },
    },
    dashboardEndpoints: endpoints,
    ipcMethods,
    notes: [
      'Dashboard GET endpoints accept Bearer auth and the dashboard query token; POST endpoints require Bearer auth.',
      'Desktop terminal execution is canonical through Electron IPC, not dashboard HTTP routes.',
    ],
  });
}

export function writeDashboardDesktopReference({
  rootDir = process.cwd(),
  outputPath = 'docs/reference/dashboard/dashboard-desktop-surface.json',
  now,
} = {}) {
  const resolvedRoot = resolve(rootDir);
  const artifact = buildDashboardDesktopReference({ rootDir: resolvedRoot, now });
  const resolvedOutput = resolve(resolvedRoot, outputPath);
  mkdirSync(dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return artifact;
}

export function readDesktopRuntime(rootDir = process.cwd()) {
  const packageJsonPath = join(resolve(rootDir), 'ctx-app', 'package.json');
  const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
  return {
    name: String(pkg.name || '').trim(),
    version: String(pkg.version || '').trim(),
    main: String(pkg.main || '').trim(),
    shell: 'electron',
    renderer: 'react_vite',
  };
}

function listFields(schema) {
  return Object.keys(schema.shape);
}

function isMainModule() {
  return Boolean(process.argv[1]) && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
}

if (isMainModule()) {
  const args = process.argv.slice(2);
  const writeIndex = args.indexOf('--write');
  const outputPath = writeIndex >= 0 && args[writeIndex + 1]
    ? args[writeIndex + 1]
    : null;
  const artifact = outputPath
    ? writeDashboardDesktopReference({ outputPath })
    : buildDashboardDesktopReference();
  process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
}
