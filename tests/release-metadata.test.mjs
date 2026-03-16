import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import {
  buildReleaseMetadata,
  extractPushBranches,
  writeReleaseMetadata,
} from '../src/docs/release-metadata.js';

test('extractPushBranches supports inline and block workflow syntax', () => {
  assert.deepEqual(
    extractPushBranches([
      'on:',
      '  push:',
      '    branches: [main, master]',
    ].join('\n')),
    ['main', 'master']
  );

  assert.deepEqual(
    extractPushBranches([
      'on:',
      '  push:',
      '    branches:',
      '      - main',
      '      - release',
    ].join('\n')),
    ['main', 'release']
  );
});

test('buildReleaseMetadata derives publish facts from package and workflow surfaces', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-release-meta-'));
  mkdirSync(join(rootDir, '.github', 'workflows'), { recursive: true });

  writeFileSync(join(rootDir, 'package.json'), JSON.stringify({
    name: 'ctx-fixture',
    version: '1.2.3',
  }), 'utf8');

  writeFileSync(join(rootDir, '.github', 'workflows', 'npm-publish-on-push.yml'), [
    'name: npm publish on push',
    'on:',
    '  push:',
    '    branches:',
    '      - main',
    '      - master',
    'jobs:',
    '  publish:',
    '    steps:',
    '      - uses: actions/setup-node@v4',
    '        with:',
    '          registry-url: https://registry.npmjs.org',
    '      - run: npm ci',
    '      - run: npm test --if-present',
    '      - env:',
    '          NODE_AUTH_TOKEN: ${{ secrets.NPM_TOKEN }}',
    '      - run: npm publish --access public',
  ].join('\n'), 'utf8');

  const metadata = buildReleaseMetadata({
    rootDir,
    now: '2026-03-11T12:30:00.000Z',
  });

  assert.equal(metadata.package.name, 'ctx-fixture');
  assert.equal(metadata.package.version, '1.2.3');
  assert.equal(metadata.versionSourceOfTruth, 'package.json');
  assert.equal(metadata.publish.workflowPath, '.github/workflows/npm-publish-on-push.yml');
  assert.deepEqual(metadata.publish.branches, ['main', 'master']);
  assert.equal(metadata.publish.requiresNpmToken, true);
  assert.equal(metadata.publish.runsTests, true);
  assert.equal(metadata.publish.registryUrl, 'https://registry.npmjs.org');
  assert.equal(metadata.publish.strategy, 'push_if_new_version');
  assert.equal(metadata.changelog.exists, false);
  assert.ok(metadata.gaps.includes('CHANGELOG.md is not present yet.'));
});

test('writeReleaseMetadata writes a schema-valid artifact', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-release-write-'));
  mkdirSync(join(rootDir, '.github', 'workflows'), { recursive: true });

  writeFileSync(join(rootDir, 'package.json'), JSON.stringify({
    name: 'ctx-write-fixture',
    version: '2.0.0',
  }), 'utf8');

  writeFileSync(join(rootDir, '.github', 'workflows', 'npm-publish-on-push.yml'), [
    'name: npm publish on push',
    'on:',
    '  push:',
    '    branches: [main]',
    'jobs:',
    '  publish:',
    '    steps:',
    '      - run: npm publish --access public',
  ].join('\n'), 'utf8');

  const metadata = writeReleaseMetadata({
    rootDir,
    outputPath: 'docs/release/release-metadata.json',
    now: '2026-03-11T12:30:00.000Z',
  });

  const persisted = JSON.parse(readFileSync(join(rootDir, 'docs', 'release', 'release-metadata.json'), 'utf8'));
  assert.equal(persisted.package.version, metadata.package.version);
  assert.equal(persisted.publish.workflowPath, metadata.publish.workflowPath);
});

test('CLI writes release metadata artifact for a real node invocation', () => {
  const rootDir = mkdtempSync(join(tmpdir(), 'ctx-release-cli-'));
  mkdirSync(join(rootDir, '.github', 'workflows'), { recursive: true });

  writeFileSync(join(rootDir, 'package.json'), JSON.stringify({
    name: 'ctx-cli-fixture',
    version: '3.0.0',
  }), 'utf8');

  writeFileSync(join(rootDir, '.github', 'workflows', 'npm-publish-on-push.yml'), [
    'name: npm publish on push',
    'on:',
    '  push:',
    '    branches: [main]',
    'jobs:',
    '  publish:',
    '    steps:',
    '      - run: npm test --if-present',
    '      - run: npm publish --access public',
  ].join('\n'), 'utf8');

  const scriptPath = resolve('scripts/docs/release-metadata.js');
  const result = spawnSync(
    process.execPath,
    [scriptPath, '--write', 'docs/release/release-metadata.json'],
    {
      cwd: rootDir,
      encoding: 'utf8',
    }
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);

  const persisted = JSON.parse(readFileSync(join(rootDir, 'docs', 'release', 'release-metadata.json'), 'utf8'));
  assert.equal(persisted.package.name, 'ctx-cli-fixture');
  assert.equal(persisted.publish.strategy, 'push_if_new_version');
});
