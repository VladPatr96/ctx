#!/usr/bin/env node

/**
 * ctx init — Interactive project setup.
 *
 * 1. Detect git root and project name
 * 2. Probe available AI providers
 * 3. Detect GITHUB_OWNER via gh api user
 * 4. Generate ctx.config.json
 * 5. Generate .mcp.json with relative paths
 * 6. Create .data/ directory
 * 7. Print quickstart instructions
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { findGitRoot, detectGitHubOwner, resolveHome } from '../core/config/resolve-config.js';

export async function init(options = {}) {
  const cwd = options.cwd || process.cwd();
  const log = options.log || console.log;
  const warn = options.warn || console.warn;

  log('ctx init — настройка проекта...\n');

  // 1. Detect git root
  const gitRoot = findGitRoot(cwd);
  if (!gitRoot) {
    warn('Внимание: не git-репозиторий. Используется текущая директория.');
  }
  const projectDir = gitRoot || cwd;
  const projectName = projectDir.replace(/\\/g, '/').split('/').pop();
  log(`  Проект: ${projectName}`);
  log(`  Корень: ${projectDir}`);

  // 2. Probe available providers
  let providers = [];
  try {
    const { probeProviders } = await import('./provider-probe.js');
    providers = probeProviders();
    const available = providers.filter((p) => p.available);
    log(`  Провайдеры: ${available.map((p) => p.name).join(', ') || 'не обнаружены'}`);
  } catch {
    log('  Провайдеры: детекция недоступна');
  }

  // 3. Detect GITHUB_OWNER
  let githubOwner = process.env.GITHUB_OWNER || process.env.CTX_GITHUB_OWNER || null;
  if (!githubOwner) {
    log('  Определяю GitHub пользователя...');
    githubOwner = detectGitHubOwner();
  }
  if (githubOwner) {
    log(`  GitHub owner: ${githubOwner}`);
  } else {
    warn('  Внимание: Не удалось определить GitHub owner. Задайте GITHUB_OWNER или авторизуйте gh CLI.');
  }

  // 4. Generate ctx.config.json
  const configPath = join(projectDir, 'ctx.config.json');
  if (existsSync(configPath)) {
    log(`\n  ctx.config.json уже существует, пропускаю.`);
  } else {
    const config = {
      githubOwner: githubOwner || '',
      centralRepo: githubOwner ? `${githubOwner}/my_claude_code` : '',
      kbRepo: githubOwner ? `${githubOwner}/ctx-knowledge` : '',
      locale: 'ru',
      dashboardPort: 7331,
    };
    writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    log(`\n  Создан ctx.config.json`);
  }

  // 5. Generate .mcp.json
  const mcpPath = join(projectDir, '.mcp.json');
  if (existsSync(mcpPath)) {
    // Check if it has hardcoded paths and warn
    try {
      const content = readFileSync(mcpPath, 'utf-8');
      if (content.includes('D:/') || content.includes('C:\\Users\\')) {
        warn('  Внимание: .mcp.json содержит hardcoded пути. Рекомендуется перегенерировать.');
      } else {
        log('  .mcp.json уже существует, пропускаю.');
      }
    } catch {
      log('  .mcp.json уже существует, пропускаю.');
    }
  } else {
    // Determine path to ctx-mcp-hub.js
    const ctxRoot = resolve(join(import.meta.url.replace('file:///', '').replace('file://', ''), '..', '..', '..'));
    let hubPath = 'scripts/ctx-mcp-hub.js';

    // If ctx is installed as npm package, use the package path
    const relPath = relative(projectDir, ctxRoot).replace(/\\/g, '/');
    if (relPath && !relPath.startsWith('..')) {
      hubPath = join(relPath, 'scripts/ctx-mcp-hub.js').replace(/\\/g, '/');
    }

    const mcpConfig = {
      mcpServers: {
        'ctx-hub': {
          command: 'node',
          args: [hubPath],
          env: {},
        },
      },
    };
    writeFileSync(mcpPath, JSON.stringify(mcpConfig, null, 2) + '\n', 'utf-8');
    log('  Создан .mcp.json');
  }

  // 6. Create .data/ directory
  const dataDir = join(projectDir, '.data');
  if (!existsSync(dataDir)) {
    mkdirSync(dataDir, { recursive: true });
    log('  Создана директория .data/');
  }

  // Ensure .data is in .gitignore
  const gitignorePath = join(projectDir, '.gitignore');
  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, 'utf-8');
    if (!content.includes('.data')) {
      writeFileSync(gitignorePath, content.trimEnd() + '\n.data/\n', 'utf-8');
      log('  Добавлен .data/ в .gitignore');
    }
  }

  // 7. Print quickstart
  log('\n--- Быстрый старт ---\n');
  log('  1. Начать сессию:');
  log('     /ctx');
  log('');
  log('  2. Поиск по базе знаний:');
  log('     /ctx-search <запрос>');
  log('');
  log('  3. Запустить consilium (мульти-перспективный анализ):');
  log('     /ctx-consilium "Стоит ли использовать микросервисы?"');
  log('');
  if (!githubOwner) {
    log('  Заметка: Задайте GITHUB_OWNER в ctx.config.json для полной функциональности.');
    log('');
  }
  log('  Документация: https://github.com/VladPatr96/my_claude_code#readme');
  log('');

  return {
    projectDir,
    projectName,
    githubOwner,
    providers: providers.map((p) => ({ id: p.id, available: p.available })),
    created: {
      config: !existsSync(configPath) || true,
      mcp: !existsSync(mcpPath) || true,
      data: true,
    },
  };
}

// CLI entry point
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'))) {
  init().catch((err) => {
    console.error(`ctx init failed: ${err.message}`);
    process.exit(1);
  });
}
