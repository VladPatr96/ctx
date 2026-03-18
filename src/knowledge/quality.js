import {
  createKnowledgeProjectExport,
  createKnowledgeQualitySummary,
} from '../contracts/knowledge-schemas.js';

const EXPORT_CATEGORY_ORDER = ['session-summary', 'decision', 'error', 'solution', 'pattern'];

export function buildKnowledgeQualitySummary({
  entries = [],
  snapshots = [],
  staleAfterDays = 30,
  now = new Date().toISOString(),
} = {}) {
  const snapshotMap = new Map();
  for (const snapshot of snapshots) {
    if (!snapshot?.project || snapshotMap.has(snapshot.project)) continue;
    snapshotMap.set(snapshot.project, snapshot);
  }

  const grouped = new Map();
  const categoryCounts = new Map();
  const staleThresholdMs = Date.parse(now) - (staleAfterDays * 24 * 60 * 60 * 1000);

  for (const entry of entries) {
    if (!entry?.project) continue;
    const projectEntries = grouped.get(entry.project) || [];
    projectEntries.push(entry);
    grouped.set(entry.project, projectEntries);
    categoryCounts.set(entry.category, (categoryCounts.get(entry.category) || 0) + 1);
  }

  let globalStaleEntries = 0;
  const projects = [];
  const gaps = [];

  for (const [project, projectEntries] of grouped.entries()) {
    const sortedEntries = [...projectEntries].sort(compareEntriesByUpdatedAt);
    const snapshot = snapshotMap.get(project) || null;
    const totalEntries = projectEntries.length;
    const staleEntries = projectEntries.filter((entry) => isStaleEntry(entry, staleThresholdMs)).length;
    const sessionEntries = projectEntries.filter((entry) => entry.category === 'session-summary').length;
    const decisionEntries = projectEntries.filter((entry) => entry.category === 'decision').length;
    const errorEntries = projectEntries.filter((entry) => entry.category === 'error').length;
    const categories = Array.from(new Set(projectEntries.map((entry) => entry.category))).sort();
    const lastUpdatedAt = getEntryTimestamp(sortedEntries[0]) || null;

    globalStaleEntries += staleEntries;

    if (!snapshot) {
      gaps.push({
        type: 'snapshot_missing',
        project,
        description: 'Project has no saved snapshot for session resume.',
      });
    }

    if (sessionEntries === 0) {
      gaps.push({
        type: 'session_missing',
        project,
        description: 'Project archive has no session-summary artifacts.',
      });
    }

    if (totalEntries > 0 && staleEntries === totalEntries) {
      gaps.push({
        type: 'stale_archive',
        project,
        description: `All knowledge artifacts are older than ${staleAfterDays} days.`,
      });
    }

    projects.push({
      project,
      totalEntries,
      lastUpdatedAt,
      snapshotExists: Boolean(snapshot),
      snapshotUpdatedAt: snapshot?.created_at || null,
      staleEntries,
      sessionEntries,
      decisionEntries,
      errorEntries,
      categories,
    });
  }

  projects.sort((left, right) => compareNullableDateStrings(right.lastUpdatedAt, left.lastUpdatedAt) || left.project.localeCompare(right.project));
  gaps.sort((left, right) => left.project.localeCompare(right.project) || left.type.localeCompare(right.type));

  const categoryCoverage = Array.from(categoryCounts.entries())
    .map(([category, count]) => ({ category, count }))
    .sort((left, right) => right.count - left.count || left.category.localeCompare(right.category));

  return createKnowledgeQualitySummary({
    generatedAt: now,
    staleAfterDays,
    totals: {
      totalEntries: entries.length,
      totalProjects: grouped.size,
      snapshotProjects: snapshotMap.size,
      staleEntries: globalStaleEntries,
    },
    categoryCoverage,
    projects,
    gaps,
  });
}

export function buildKnowledgeProjectExport({
  project,
  entries = [],
  continuity,
  staleAfterDays = 30,
  limit = 5,
  now = new Date().toISOString(),
} = {}) {
  const scopedEntries = (entries || [])
    .filter((entry) => entry.project === project)
    .sort(compareEntriesByUpdatedAt);
  const staleThresholdMs = Date.parse(now) - (staleAfterDays * 24 * 60 * 60 * 1000);
  const categories = Array.from(new Set(scopedEntries.map((entry) => entry.category))).sort();
  const staleEntries = scopedEntries.filter((entry) => isStaleEntry(entry, staleThresholdMs)).length;
  const lastUpdatedAt = getEntryTimestamp(scopedEntries[0]) || null;
  const sections = [];

  for (const category of EXPORT_CATEGORY_ORDER) {
    const categoryEntries = scopedEntries.filter((entry) => entry.category === category);
    if (categoryEntries.length === 0) continue;
    sections.push({
      category,
      count: categoryEntries.length,
      entries: categoryEntries.slice(0, limit),
    });
  }

  return createKnowledgeProjectExport({
    generatedAt: now,
    project,
    staleAfterDays,
    snapshot: continuity?.snapshot || {
      exists: false,
      createdAt: null,
      branch: null,
      task: null,
      stage: null,
    },
    continuity,
    quality: {
      totalEntries: scopedEntries.length,
      staleEntries,
      lastUpdatedAt,
      categories,
    },
    sections,
  });
}

function getEntryTimestamp(entry) {
  if (!entry) return null;
  return typeof entry.updated_at === 'string' && entry.updated_at
    ? entry.updated_at
    : typeof entry.created_at === 'string' && entry.created_at
      ? entry.created_at
      : null;
}

function isStaleEntry(entry, staleThresholdMs) {
  const ts = Date.parse(getEntryTimestamp(entry) || '');
  return Number.isFinite(ts) && ts <= staleThresholdMs;
}

function compareEntriesByUpdatedAt(left, right) {
  return compareNullableDateStrings(getEntryTimestamp(right), getEntryTimestamp(left));
}

function compareNullableDateStrings(left, right) {
  const leftTs = Date.parse(left || '');
  const rightTs = Date.parse(right || '');
  const safeLeft = Number.isFinite(leftTs) ? leftTs : 0;
  const safeRight = Number.isFinite(rightTs) ? rightTs : 0;
  return safeLeft - safeRight;
}
