import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createReleaseMetadata } from '../contracts/artifact-schemas.js';

export function readPackageMetadata(rootDir = process.cwd()) {
  const packageJsonPath = join(resolve(rootDir), 'package.json');
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));

  return {
    name: String(packageJson.name || '').trim(),
    version: String(packageJson.version || '').trim(),
  };
}

export function collectWorkflowFiles(rootDir = process.cwd()) {
  const workflowDir = join(resolve(rootDir), '.github', 'workflows');
  if (!existsSync(workflowDir)) {
    return [];
  }

  return readdirSync(workflowDir, { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const fullPath = join(workflowDir, entry.name);
      return {
        name: entry.name,
        path: `.github/workflows/${entry.name}`,
        content: readFileSync(fullPath, 'utf8'),
      };
    })
    .sort((left, right) => left.path.localeCompare(right.path));
}

export function extractPushBranches(content) {
  const lines = String(content || '').split(/\r?\n/);
  const pushIndex = lines.findIndex((line) => line.trim() === 'push:');
  if (pushIndex === -1) {
    return [];
  }

  const pushIndent = getIndent(lines[pushIndex]);

  for (let index = pushIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const indent = getIndent(line);
    if (indent <= pushIndent) {
      break;
    }

    if (!trimmed.startsWith('branches:')) {
      continue;
    }

    const inlineMatch = trimmed.match(/^branches:\s*\[(.+)\]\s*$/);
    if (inlineMatch) {
      return inlineMatch[1]
        .split(',')
        .map((branch) => branch.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    }

    const branchIndent = indent;
    const branches = [];
    for (let branchIndex = index + 1; branchIndex < lines.length; branchIndex += 1) {
      const branchLine = lines[branchIndex];
      const branchTrimmed = branchLine.trim();
      if (!branchTrimmed || branchTrimmed.startsWith('#')) {
        continue;
      }

      const branchLineIndent = getIndent(branchLine);
      if (branchLineIndent <= branchIndent) {
        break;
      }

      const branchMatch = branchTrimmed.match(/^-\s*(.+)$/);
      if (branchMatch) {
        branches.push(branchMatch[1].trim().replace(/^['"]|['"]$/g, ''));
      }
    }
    return branches;
  }

  return [];
}

export function detectPublishWorkflow(workflows) {
  const workflow = workflows.find((candidate) =>
    candidate.content.includes('npm publish') || candidate.content.includes('NODE_AUTH_TOKEN')
  );

  if (!workflow) {
    return {
      workflowName: null,
      workflowPath: null,
      branches: [],
      requiresNpmToken: false,
      runsTests: false,
      registryUrl: null,
      strategy: 'missing',
    };
  }

  const registryMatch = workflow.content.match(/registry-url:\s*(https:\/\/[^\s]+)/);
  const runsTests = /run:\s*npm test\b|run:\s*npm test --if-present\b/.test(workflow.content);
  const requiresNpmToken = workflow.content.includes('NPM_TOKEN');

  return {
    workflowName: extractWorkflowName(workflow.content),
    workflowPath: workflow.path,
    branches: extractPushBranches(workflow.content),
    requiresNpmToken,
    runsTests,
    registryUrl: registryMatch ? registryMatch[1] : null,
    strategy: 'push_if_new_version',
  };
}

export function buildReleaseMetadata({ rootDir = process.cwd(), now = new Date().toISOString() } = {}) {
  const resolvedRoot = resolve(rootDir);
  const pkg = readPackageMetadata(resolvedRoot);
  const workflows = collectWorkflowFiles(resolvedRoot);
  const publish = detectPublishWorkflow(workflows);
  const changelogPath = 'CHANGELOG.md';
  const changelogExists = existsSync(join(resolvedRoot, changelogPath));
  const releaseNotes = detectReleaseNotesAutomation(workflows);
  const gaps = [];

  if (!changelogExists) {
    gaps.push('CHANGELOG.md is not present yet.');
  }
  if (!publish.workflowPath) {
    gaps.push('npm publish workflow is missing.');
  } else {
    if (!publish.runsTests) {
      gaps.push('npm publish workflow does not run tests before publish.');
    }
    if (!publish.requiresNpmToken) {
      gaps.push('npm publish workflow does not require NPM_TOKEN.');
    }
  }
  if (!releaseNotes.automated) {
    gaps.push('Automated release notes generation is not configured.');
  }
  if (!releaseNotes.usesConventionalCommits) {
    gaps.push('Conventional-commit-driven release notes are not configured.');
  }

  return createReleaseMetadata({
    generatedAt: now,
    package: pkg,
    versionSourceOfTruth: 'package.json',
    publish,
    changelog: {
      exists: changelogExists,
      path: changelogPath,
      automated: false,
    },
    releaseNotes,
    gaps,
  });
}

export function writeReleaseMetadata({
  rootDir = process.cwd(),
  outputPath = 'docs/release/release-metadata.json',
  now,
} = {}) {
  const resolvedRoot = resolve(rootDir);
  const metadata = buildReleaseMetadata({ rootDir: resolvedRoot, now });
  const resolvedOutput = resolve(resolvedRoot, outputPath);
  mkdirSync(dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
  return metadata;
}

function extractWorkflowName(content) {
  const match = String(content || '').match(/^name:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

function detectReleaseNotesAutomation(workflows) {
  const combinedContent = workflows.map((workflow) => workflow.content.toLowerCase()).join('\n');
  const automated = combinedContent.includes('release notes')
    || combinedContent.includes('release-drafter')
    || combinedContent.includes('gh release create');
  const usesConventionalCommits = combinedContent.includes('conventional')
    || combinedContent.includes('semantic-release')
    || combinedContent.includes('changesets');

  return {
    automated,
    usesConventionalCommits,
  };
}

function getIndent(line) {
  const match = String(line || '').match(/^\s*/);
  return match ? match[0].length : 0;
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
  const metadata = outputPath
    ? writeReleaseMetadata({ outputPath })
    : buildReleaseMetadata();
  process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);
}
