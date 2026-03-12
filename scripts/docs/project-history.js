import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { extractSections } from '../ctx-session-save.js';
import { createProjectHistoryArtifact } from '../contracts/project-history-schemas.js';

export function buildProjectHistoryArtifact({
  rootDir = process.cwd(),
  now = new Date().toISOString(),
} = {}) {
  const resolvedRoot = resolve(rootDir);
  const sessionEntries = [];
  const decisionEntries = [];

  for (const sessionPath of listSessionFiles(resolvedRoot)) {
    const { session, decisions } = parseSessionHistoryFile(sessionPath, resolvedRoot);
    sessionEntries.push(session);
    decisionEntries.push(...decisions);
  }

  for (const adrPath of listAdrFiles(resolvedRoot)) {
    decisionEntries.push(parseAdrDecisionFile(adrPath, resolvedRoot));
  }

  return createProjectHistoryArtifact({
    generatedAt: now,
    sessions: sessionEntries,
    decisions: decisionEntries,
  });
}

export function writeProjectHistoryArtifact({
  rootDir = process.cwd(),
  outputPath = 'docs/reference/project-memory/session-decision-history.json',
  now,
} = {}) {
  const artifact = buildProjectHistoryArtifact({ rootDir, now });
  const resolvedOutput = resolve(rootDir, outputPath);
  mkdirSync(dirname(resolvedOutput), { recursive: true });
  writeFileSync(resolvedOutput, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return artifact;
}

function listSessionFiles(rootDir) {
  const sessionsDir = join(rootDir, '.sessions');
  if (!existsSync(sessionsDir)) {
    return [];
  }

  return readdirSync(sessionsDir)
    .filter((fileName) => fileName.endsWith('.md'))
    .sort()
    .map((fileName) => join(sessionsDir, fileName));
}

function listAdrFiles(rootDir) {
  const docsDir = join(rootDir, 'docs');
  if (!existsSync(docsDir)) {
    return [];
  }

  return readdirSync(docsDir)
    .filter((fileName) => /^ADR_.+\.md$/i.test(fileName))
    .sort()
    .map((fileName) => join(docsDir, fileName));
}

function parseSessionHistoryFile(sessionPath, rootDir) {
  const content = readFileSync(sessionPath, 'utf8');
  const sections = sanitizeSections(extractSections(content));
  const sessionId = basename(sessionPath, '.md');
  const relativePath = normalizeRelativePath(rootDir, sessionPath);
  const decisions = parseSessionDecisionLines(sections.decisions).map((summary, index) => ({
    id: `${sessionId}:decision:${index + 1}`,
    source: 'session',
    title: `Session decision ${index + 1}`,
    path: relativePath,
    recordedOn: sessionId,
    status: null,
    summary,
    sessionId,
  }));

  return {
    session: {
      sessionId,
      title: parseSessionTitle(content) || `Session ${sessionId}`,
      path: relativePath,
      project: parseSessionMetadata(content, 'Project'),
      branch: parseSessionMetadata(content, 'Branch'),
      lead: parseSessionMetadata(content, 'Lead'),
      goals: nullableText(parseSessionMetadata(content, 'Goals')),
      summary: createPreview(sections.summary),
      actionsCount: countMeaningfulLines(sections.actions),
      errorsCount: countMeaningfulLines(sections.errors_solutions),
      decisionsCount: decisions.length,
      filesModifiedCount: countMeaningfulLines(sections.files_modified),
      tasksCount: countMeaningfulLines(sections.tasks),
    },
    decisions,
  };
}

function parseAdrDecisionFile(adrPath, rootDir) {
  const content = readFileSync(adrPath, 'utf8');
  const relativePath = normalizeRelativePath(rootDir, adrPath);
  const title = firstMatch(content, /^#\s+(.+)$/m) || basename(adrPath, '.md');
  const status = nullableText(firstMatch(content, /^Status:\s+(.+)$/m));
  const recordedOn = firstMatch(content, /^Date:\s+(.+)$/m) || basename(adrPath, '.md');
  const decisionSection = extractMarkdownSection(content, 'Decision') || content;

  return {
    id: basename(adrPath, '.md'),
    source: 'adr',
    title,
    path: relativePath,
    recordedOn,
    status,
    summary: createPreview(decisionSection) || title,
    sessionId: null,
  };
}

function parseSessionTitle(content) {
  return nullableText(firstMatch(content, /^#\s+(.+)$/m));
}

function parseSessionMetadata(content, label) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return nullableText(firstMatch(content, new RegExp(`^\\*\\*${escapedLabel}:\\*\\*\\s*(.+)$`, 'm')));
}

function extractMarkdownSection(content, name) {
  const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = content.match(new RegExp(`^##\\s+${escapedName}\\s*$([\\s\\S]*?)(?=^##\\s+|\\Z)`, 'm'));
  return nullableText(match?.[1] || '');
}

function parseSessionDecisionLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^[-*+]\s+/, '').replace(/^\d+\.\s+/, '').trim())
    .filter(Boolean);
}

function countMeaningfulLines(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .length;
}

function sanitizeSections(sections) {
  return Object.fromEntries(
    Object.entries(sections || {}).map(([key, value]) => [key, truncateAtHeadingBoundary(value)])
  );
}

function truncateAtHeadingBoundary(text) {
  const lines = String(text || '').split(/\r?\n/);
  const keptLines = [];

  for (const line of lines) {
    if (line.trim().startsWith('## ')) {
      break;
    }
    keptLines.push(line);
  }

  return keptLines.join('\n').trim();
}

function createPreview(text, maxLength = 240) {
  const normalized = nullableText(String(text || '').replace(/\s+/g, ' '));
  if (!normalized) {
    return null;
  }
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 3).trimEnd()}...`;
}

function firstMatch(content, pattern) {
  return content.match(pattern)?.[1]?.trim() || null;
}

function normalizeRelativePath(rootDir, absolutePath) {
  return relative(rootDir, absolutePath).replace(/\\/g, '/');
}

function nullableText(value) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'TBD') {
    return null;
  }
  return trimmed;
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
    ? writeProjectHistoryArtifact({ outputPath })
    : buildProjectHistoryArtifact();
  process.stdout.write(`${JSON.stringify(artifact, null, 2)}\n`);
}
