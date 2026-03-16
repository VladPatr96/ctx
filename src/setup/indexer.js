#!/usr/bin/env node

/**
 * ctx-indexer.js
 *
 * Глубокий индексатор проекта. Строит полную карту:
 * - Стек технологий (runtime, framework, language)
 * - Структура директорий с назначением
 * - i18n обнаружение
 * - Git состояние
 * - Паттерны (конфиги, тесты, билд)
 *
 * Результат сохраняется в .data/index.json
 */

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs';
import { join, extname, basename, relative } from 'node:path';

const DATA_DIR = process.env.CTX_DATA_DIR || join(process.cwd(), '.data');
const PROJECT_DIR = process.env.CLAUDE_PROJECT_DIR || process.cwd();

const IGNORE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  '__pycache__', '.venv', 'venv', '.tox', 'target',
  '.idea', '.vscode', '.cache', 'coverage', '.turbo',
  '.output', '.svelte-kit', 'vendor', 'bin', 'obj'
]);

const IGNORE_FILES = new Set([
  '.DS_Store', 'Thumbs.db', '.gitkeep'
]);

function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf-8', cwd: PROJECT_DIR, timeout: 10000 }).trim();
  } catch {
    return '';
  }
}

function detectStack() {
  const stack = { runtime: null, framework: null, lang: [], packageManager: null };
  const root = PROJECT_DIR;

  // Runtime & Package Manager
  if (existsSync(join(root, 'package.json'))) {
    stack.runtime = 'node';
    if (existsSync(join(root, 'bun.lockb'))) stack.packageManager = 'bun';
    else if (existsSync(join(root, 'pnpm-lock.yaml'))) stack.packageManager = 'pnpm';
    else if (existsSync(join(root, 'yarn.lock'))) stack.packageManager = 'yarn';
    else stack.packageManager = 'npm';

    try {
      const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Framework detection
      if (deps['next']) stack.framework = 'next.js';
      else if (deps['nuxt']) stack.framework = 'nuxt';
      else if (deps['@sveltejs/kit']) stack.framework = 'sveltekit';
      else if (deps['react']) stack.framework = 'react';
      else if (deps['vue']) stack.framework = 'vue';
      else if (deps['@angular/core']) stack.framework = 'angular';
      else if (deps['express']) stack.framework = 'express';
      else if (deps['fastify']) stack.framework = 'fastify';
      else if (deps['hono']) stack.framework = 'hono';

      // Language
      if (deps['typescript'] || existsSync(join(root, 'tsconfig.json'))) {
        stack.lang.push('typescript');
      }
    } catch { /* ignore */ }
  }

  if (existsSync(join(root, 'go.mod'))) { stack.runtime = 'go'; stack.lang.push('go'); }
  if (existsSync(join(root, 'Cargo.toml'))) { stack.runtime = 'rust'; stack.lang.push('rust'); }
  if (existsSync(join(root, 'requirements.txt')) || existsSync(join(root, 'pyproject.toml'))) {
    stack.runtime = 'python'; stack.lang.push('python');
  }
  if (existsSync(join(root, 'pom.xml')) || existsSync(join(root, 'build.gradle'))) {
    stack.runtime = 'java'; stack.lang.push('java');
  }

  if (stack.lang.length === 0) stack.lang.push('javascript');

  return stack;
}

function scanDirectory(dir, maxDepth = 4, currentDepth = 0) {
  const structure = {};

  if (currentDepth >= maxDepth) return structure;
  if (!existsSync(dir)) return structure;

  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return structure;
  }

  const files = [];
  const types = new Set();

  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry) || IGNORE_FILES.has(entry)) continue;
    if (entry.startsWith('.') && currentDepth === 0 && entry !== '.env.example') continue;

    const fullPath = join(dir, entry);
    let stat;
    try {
      stat = statSync(fullPath);
    } catch {
      continue;
    }

    if (stat.isDirectory()) {
      const relPath = relative(PROJECT_DIR, fullPath).replace(/\\/g, '/') + '/';
      const subScan = scanDirectory(fullPath, maxDepth, currentDepth + 1);
      const fileCount = countFiles(fullPath);
      const fileTypes = getFileTypes(fullPath);

      structure[relPath] = {
        files: fileCount,
        types: [...fileTypes].slice(0, 5),
        purpose: guessPurpose(entry, fileTypes),
        ...subScan
      };
    } else {
      files.push(entry);
      types.add(extname(entry));
    }
  }

  return structure;
}

function countFiles(dir) {
  let count = 0;
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry) || IGNORE_FILES.has(entry)) continue;
      const full = join(dir, entry);
      try {
        if (statSync(full).isFile()) count++;
      } catch { /* skip */ }
    }
  } catch { /* skip */ }
  return count;
}

function getFileTypes(dir) {
  const types = new Set();
  try {
    const entries = readdirSync(dir);
    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry)) continue;
      const ext = extname(entry);
      if (ext) types.add(ext);
    }
  } catch { /* skip */ }
  return types;
}

function guessPurpose(dirName, types) {
  const name = dirName.toLowerCase();
  const typeArr = [...types];

  if (['pages', 'routes', 'app'].includes(name)) return 'routes';
  if (['components', 'ui', 'widgets'].includes(name)) return 'UI components';
  if (['locales', 'i18n', 'translations', 'lang', 'messages'].includes(name)) return 'i18n translations';
  if (['public', 'static', 'assets'].includes(name)) return 'static assets';
  if (['lib', 'utils', 'helpers'].includes(name)) return 'utilities';
  if (['api', 'server', 'backend'].includes(name)) return 'API/backend';
  if (['styles', 'css'].includes(name)) return 'styles';
  if (['hooks'].includes(name)) return 'hooks';
  if (['store', 'stores', 'state'].includes(name)) return 'state management';
  if (['types', 'interfaces'].includes(name)) return 'type definitions';
  if (['config', 'configs'].includes(name)) return 'configuration';
  if (['test', 'tests', '__tests__', 'spec'].includes(name)) return 'tests';
  if (['docs', 'documentation'].includes(name)) return 'documentation';
  if (['scripts'].includes(name)) return 'scripts';
  if (['migrations'].includes(name)) return 'database migrations';
  if (['middleware'].includes(name)) return 'middleware';
  if (['services'].includes(name)) return 'services';
  if (['models', 'entities'].includes(name)) return 'data models';
  if (['commands', 'cmd'].includes(name)) return 'CLI commands';
  if (['skills'].includes(name)) return 'agent skills';
  if (['agents'].includes(name)) return 'agent definitions';

  if (typeArr.some(t => ['.json', '.yaml', '.yml', '.toml'].includes(t))) return 'data/config';
  if (typeArr.some(t => ['.md', '.mdx', '.txt'].includes(t))) return 'documentation';

  return null;
}

function detectI18n() {
  const i18n = { detected: false, localesDir: null, languages: [], framework: null };
  const root = PROJECT_DIR;

  // Check common i18n directories
  const i18nDirs = ['locales', 'i18n', 'translations', 'lang', 'messages', 'src/locales', 'src/i18n', 'public/locales'];
  for (const dir of i18nDirs) {
    const fullPath = join(root, dir);
    if (existsSync(fullPath)) {
      i18n.detected = true;
      i18n.localesDir = dir;

      // Detect languages
      try {
        const entries = readdirSync(fullPath);
        for (const entry of entries) {
          const name = entry.replace(extname(entry), '');
          if (name.match(/^[a-z]{2}(-[A-Z]{2})?$/)) {
            i18n.languages.push(name);
          }
        }
      } catch { /* skip */ }
      break;
    }
  }

  // Detect i18n framework
  try {
    if (existsSync(join(root, 'package.json'))) {
      const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      if (deps['next-intl']) i18n.framework = 'next-intl';
      else if (deps['react-i18next']) i18n.framework = 'react-i18next';
      else if (deps['vue-i18n']) i18n.framework = 'vue-i18n';
      else if (deps['@nuxtjs/i18n']) i18n.framework = '@nuxtjs/i18n';
      else if (deps['i18next']) i18n.framework = 'i18next';
    }
  } catch { /* skip */ }

  return i18n;
}

function getGitInfo() {
  return {
    branch: exec('git branch --show-current'),
    modified: exec('git diff --name-only').split('\n').filter(Boolean),
    staged: exec('git diff --cached --name-only').split('\n').filter(Boolean),
    untracked: exec('git ls-files --others --exclude-standard').split('\n').filter(Boolean).length,
    recentCommits: exec('git log -10 --oneline').split('\n').filter(Boolean)
  };
}

function detectPatterns() {
  const root = PROJECT_DIR;
  const patterns = { configFiles: [], testDirs: [], buildOutput: [], entryPoints: [] };

  // Config files
  const configs = [
    'next.config.js', 'next.config.ts', 'next.config.mjs',
    'vite.config.ts', 'vite.config.js',
    'tsconfig.json', 'jsconfig.json',
    '.eslintrc.js', '.eslintrc.json', 'eslint.config.js',
    '.prettierrc', '.prettierrc.json',
    'tailwind.config.js', 'tailwind.config.ts',
    'postcss.config.js',
    '.env', '.env.local', '.env.example',
    'docker-compose.yml', 'Dockerfile',
    'CLAUDE.md', 'GEMINI.md', 'AGENTS.md',
    'opencode.jsonc'
  ];

  for (const f of configs) {
    if (existsSync(join(root, f))) patterns.configFiles.push(f);
  }

  // Test directories
  const testDirs = ['test', 'tests', '__tests__', 'spec', 'e2e', 'cypress'];
  for (const d of testDirs) {
    if (existsSync(join(root, d))) patterns.testDirs.push(d + '/');
  }

  // Build output
  const buildDirs = ['dist', 'build', '.next', '.nuxt', '.output', 'out', 'target'];
  for (const d of buildDirs) {
    if (existsSync(join(root, d))) patterns.buildOutput.push(d + '/');
  }

  return patterns;
}

function main() {
  console.log(`[ctx-indexer] Indexing project: ${PROJECT_DIR}`);

  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }

  const index = {
    project: basename(PROJECT_DIR),
    timestamp: new Date().toISOString(),
    stack: detectStack(),
    structure: scanDirectory(PROJECT_DIR),
    i18n: detectI18n(),
    git: getGitInfo(),
    patterns: detectPatterns()
  };

  const outputPath = join(DATA_DIR, 'index.json');
  writeFileSync(outputPath, JSON.stringify(index, null, 2));

  // Print summary
  const dirCount = Object.keys(index.structure).length;
  console.log(`[ctx-indexer] Done.`);
  console.log(`  Stack: ${index.stack.runtime} / ${index.stack.framework || 'none'} (${index.stack.lang.join(', ')})`);
  console.log(`  Directories: ${dirCount}`);
  console.log(`  i18n: ${index.i18n.detected ? `yes (${index.i18n.framework || 'custom'}, ${index.i18n.languages.length} langs)` : 'no'}`);
  console.log(`  Branch: ${index.git.branch}`);
  console.log(`  Modified: ${index.git.modified.length} files`);
  console.log(`  Index saved: ${outputPath}`);

  // Output JSON to stdout for MCP consumption
  console.log(JSON.stringify(index));
}

main();
