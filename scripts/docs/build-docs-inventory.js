import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createDocsInventory } from '../contracts/docs-schemas.js';

const ROOT_FILES = ['README.md', 'AGENTS.md', 'WORKFLOW.md'];
const ROOT_GLOB_PREFIXES = ['CTX_', 'OPENCODE_', 'E2E-', 'verify-'];
const ROOT_DIRS = ['docs', 'skills', 'agents'];

export function collectDocsFiles({ rootDir = process.cwd() } = {}) {
  const resolvedRoot = resolve(rootDir);
  const files = [];

  for (const fileName of ROOT_FILES) {
    const filePath = join(resolvedRoot, fileName);
    if (existsSync(filePath) && statSync(filePath).isFile()) {
      files.push(relative(resolvedRoot, filePath).replace(/\\/g, '/'));
    }
  }

  for (const entry of readdirSync(resolvedRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    if (ROOT_FILES.includes(entry.name)) continue;
    if (ROOT_GLOB_PREFIXES.some((prefix) => entry.name.startsWith(prefix))) {
      files.push(entry.name);
    }
  }

  for (const dirName of ROOT_DIRS) {
    const dirPath = join(resolvedRoot, dirName);
    if (!existsSync(dirPath) || !statSync(dirPath).isDirectory()) continue;
    walkMarkdownFiles(dirPath, resolvedRoot, files);
  }

  return [...new Set(files)].sort();
}

export function classifyDocSurface(relativePath) {
  const normalizedPath = String(relativePath || '').replace(/\\/g, '/');
  const fileName = normalizedPath.split('/').pop() || normalizedPath;
  const upperName = fileName.toUpperCase();

  if (normalizedPath === 'README.md') {
    return {
      path: normalizedPath,
      sourceType: 'root',
      status: 'canonical',
      category: 'overview',
      audience: 'user',
      targetSurface: 'docs/index',
      notes: ['Product landing page and top-level installation surface.'],
    };
  }

  if (normalizedPath === 'AGENTS.md') {
    return {
      path: normalizedPath,
      sourceType: 'root',
      status: 'source_material',
      category: 'agents',
      audience: 'internal',
      targetSurface: 'docs/reference/agent-runtime',
      notes: ['Source material for host/runtime integration docs rather than end-user docs.'],
    };
  }

  if (normalizedPath === 'WORKFLOW.md') {
    return {
      path: normalizedPath,
      sourceType: 'root',
      status: 'migrate',
      category: 'workflow',
      audience: 'contributor',
      targetSurface: 'docs/contributing/project-memory',
      notes: ['Root workflow note should live under contributing/process docs.'],
    };
  }

  if (normalizedPath.startsWith('docs/')) {
    return classifyDocsDirSurface(normalizedPath, upperName);
  }

  if (normalizedPath.startsWith('skills/')) {
    return {
      path: normalizedPath,
      sourceType: 'skills',
      status: 'source_material',
      category: 'skills',
      audience: 'contributor',
      targetSurface: 'docs/reference/skills',
      notes: ['Skill markdown remains source material for generated/reference docs.'],
    };
  }

  if (normalizedPath.startsWith('agents/')) {
    return {
      path: normalizedPath,
      sourceType: 'agents',
      status: 'source_material',
      category: 'agents',
      audience: 'contributor',
      targetSurface: 'docs/reference/agents',
      notes: ['Agent role files are runtime/reference inputs, not primary product docs.'],
    };
  }

  return {
    path: normalizedPath,
    sourceType: 'root',
    status: 'migrate',
    category: inferRootCategory(upperName),
    audience: inferRootAudience(upperName),
    targetSurface: inferRootTargetSurface(upperName),
    notes: ['Root markdown surface should migrate into the canonical docs IA.'],
  };
}

export function buildDocsInventory({ rootDir = process.cwd(), now = new Date().toISOString(), project = null } = {}) {
  const resolvedRoot = resolve(rootDir);
  const entries = collectDocsFiles({ rootDir: resolvedRoot }).map((path) => classifyDocSurface(path));
  return createDocsInventory({
    generatedAt: now,
    project: project || inferProjectName(resolvedRoot),
    entries,
  });
}

export function writeDocsInventory({ rootDir = process.cwd(), outputPath = 'docs/docs-surface.inventory.json', now } = {}) {
  const resolvedRoot = resolve(rootDir);
  const inventory = buildDocsInventory({ rootDir: resolvedRoot, now });
  const resolvedOutput = resolve(resolvedRoot, outputPath);
  mkdirSync(dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
  return inventory;
}

function walkMarkdownFiles(dirPath, rootDir, files) {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    const absolutePath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walkMarkdownFiles(absolutePath, rootDir, files);
      continue;
    }
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
    files.push(relative(rootDir, absolutePath).replace(/\\/g, '/'));
  }
}

function classifyDocsDirSurface(path, upperName) {
  if (path.startsWith('docs/setup/')) {
    return {
      path,
      sourceType: 'docs',
      status: 'canonical',
      category: 'setup',
      audience: 'user',
      targetSurface: 'docs/setup/providers',
      notes: [],
    };
  }

  if (path.startsWith('docs/reference/')) {
    return {
      path,
      sourceType: 'docs',
      status: 'canonical',
      category: inferReferenceCategory(path),
      audience: inferReferenceAudience(path),
      targetSurface: inferReferenceTargetSurface(path),
      notes: [],
    };
  }

  if (path.startsWith('docs/release/')) {
    return {
      path,
      sourceType: 'docs',
      status: 'canonical',
      category: 'release',
      audience: 'contributor',
      targetSurface: 'docs/release/versioning',
      notes: [],
    };
  }

  if (path.startsWith('docs/research/')) {
    return {
      path,
      sourceType: 'docs',
      status: 'canonical',
      category: 'research',
      audience: 'contributor',
      targetSurface: 'docs/research',
      notes: [],
    };
  }

  if (path.startsWith('docs/migration/')) {
    return {
      path,
      sourceType: 'docs',
      status: 'canonical',
      category: 'migration',
      audience: 'user',
      targetSurface: 'docs/migration',
      notes: [],
    };
  }

  if (upperName.startsWith('ADR_')) {
    return {
      path,
      sourceType: 'docs',
      status: 'canonical',
      category: 'architecture',
      audience: 'contributor',
      targetSurface: 'docs/architecture/adr',
      notes: ['ADR is already in the canonical architecture docs bucket.'],
    };
  }

  if (upperName.includes('TEST')) {
    return {
      path,
      sourceType: 'docs',
      status: 'canonical',
      category: 'testing',
      audience: 'contributor',
      targetSurface: 'docs/contributing/testing',
      notes: [],
    };
  }

  return {
    path,
    sourceType: 'docs',
    status: 'canonical',
    category: 'workflow',
    audience: 'contributor',
    targetSurface: 'docs/contributing/project-memory',
    notes: [],
  };
}

function inferRootCategory(upperName) {
  if (upperName.includes('SETUP') || upperName.includes('UNIVERSAL') || upperName.includes('OPENCODE') || upperName.includes('PROVIDER')) {
    return 'setup';
  }
  if (upperName.includes('TEST') || upperName.includes('VERIFICATION')) {
    return 'testing';
  }
  if (upperName.includes('SKILL')) {
    return 'skills';
  }
  if (upperName.includes('PLAN') || upperName.includes('ROADMAP') || upperName.includes('STATUS')) {
    return 'planning';
  }
  if (upperName.includes('AUTOMATION')) {
    return 'workflow';
  }
  return 'archive';
}

function inferRootAudience(upperName) {
  if (upperName.includes('SETUP') || upperName.includes('UNIVERSAL') || upperName.includes('OPENCODE')) {
    return 'user';
  }
  return 'contributor';
}

function inferRootTargetSurface(upperName) {
  if (upperName.includes('SETUP') || upperName.includes('UNIVERSAL') || upperName.includes('OPENCODE') || upperName.includes('PROVIDER')) {
    return 'docs/setup/providers';
  }
  if (upperName.includes('TEST') || upperName.includes('VERIFICATION')) {
    return 'docs/contributing/testing';
  }
  if (upperName.includes('SKILL')) {
    return 'docs/reference/skills';
  }
  if (upperName.includes('PLAN') || upperName.includes('ROADMAP') || upperName.includes('STATUS')) {
    return 'docs/archive/planning-notes';
  }
  if (upperName.includes('AUTOMATION') || upperName.includes('WORKFLOW')) {
    return 'docs/contributing/project-memory';
  }
  return 'docs/archive/root-docs';
}

function inferProjectName(rootDir) {
  const packageJsonPath = join(rootDir, 'package.json');
  if (existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
      if (typeof pkg.name === 'string' && pkg.name.trim()) {
        return pkg.name.trim();
      }
    } catch {
      // Ignore and fall back to folder name.
    }
  }

  const normalizedRoot = rootDir.replace(/\\/g, '/').replace(/\/+$/, '');
  const segments = normalizedRoot.split('/');
  return segments[segments.length - 1] || 'project';
}

function inferReferenceCategory(path) {
  if (path.includes('/dashboard/')) return 'reference';
  if (path.includes('/skills')) return 'skills';
  if (path.includes('/agents')) return 'agents';
  return 'reference';
}

function inferReferenceAudience(path) {
  if (path.includes('/project-memory')) return 'operator';
  if (path.includes('/dashboard/')) return 'operator';
  return 'user';
}

function inferReferenceTargetSurface(path) {
  if (path.includes('/project-memory')) return 'docs/reference/project-memory';
  if (path.includes('/dashboard/')) return 'docs/reference/dashboard';
  if (path.includes('/skills')) return 'docs/reference/skills';
  if (path.includes('/agents')) return 'docs/reference/agents';
  return 'docs/reference/interfaces';
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
  const inventory = outputPath
    ? writeDocsInventory({ outputPath })
    : buildDocsInventory();
  process.stdout.write(`${JSON.stringify(inventory, null, 2)}\n`);
}
