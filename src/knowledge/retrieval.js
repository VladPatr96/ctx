import { createKnowledgeRetrievalHit } from '../contracts/knowledge-schemas.js';

export function rankKnowledgeEntries(entries, query, options = {}) {
  const normalizedQuery = tokenize(query);
  if (!normalizedQuery.length) return [];

  const ranked = [];
  for (const entry of entries || []) {
    const score = scoreKnowledgeEntry(entry, normalizedQuery, options);
    if (score == null) continue;
    ranked.push(createKnowledgeRetrievalHit({
      ...entry,
      retrieval: score,
    }));
  }

  ranked.sort((left, right) =>
    right.retrieval.score - left.retrieval.score ||
    String(right.updated_at || right.created_at || '').localeCompare(String(left.updated_at || left.created_at || '')) ||
    String(left.title).localeCompare(String(right.title))
  );
  return ranked;
}

function scoreKnowledgeEntry(entry, queryTerms, options) {
  const title = String(entry.title || '').toLowerCase();
  const body = String(entry.body || '').toLowerCase();
  const tags = String(entry.tags || '').toLowerCase();
  let textScore = 0;

  for (const term of queryTerms) {
    if (title.includes(term)) textScore += 3;
    if (tags.includes(term)) textScore += 2;
    if (body.includes(term)) textScore += 1;
  }

  if (textScore <= 0) return null;

  const preferredProject = String(options.preferredProject || '').trim();
  const projectBoost = preferredProject && entry.project === preferredProject ? 2 : 0;
  const recencyBoost = computeRecencyBoost(entry.updated_at || entry.created_at, options.now);
  const accessBoost = Math.min(Number(entry.access_count || 0), 10) * 0.05;
  const score = +(textScore + projectBoost + recencyBoost + accessBoost).toFixed(4);

  return {
    strategy: 'hybrid',
    score,
    textScore,
    projectBoost,
    recencyBoost,
    accessBoost,
    matchReason: buildMatchReason({ textScore, projectBoost, recencyBoost, accessBoost }, entry),
  };
}

function buildMatchReason(components, entry) {
  if (components.projectBoost > 0) {
    return `Boosted for current project ${entry.project}`;
  }
  if (components.recencyBoost >= 0.75) {
    return 'Boosted for recent project memory';
  }
  if (components.textScore >= 6) {
    return 'Multiple strong text matches';
  }
  if (components.accessBoost >= 0.25) {
    return 'Frequently accessed knowledge artifact';
  }
  return 'Relevant text match';
}

function computeRecencyBoost(isoString, nowInput) {
  if (!isoString) return 0;
  const timestamp = Date.parse(String(isoString));
  if (!Number.isFinite(timestamp)) return 0;
  const now = nowInput ? Date.parse(String(nowInput)) : Date.now();
  if (!Number.isFinite(now)) return 0;
  const ageMs = Math.max(0, now - timestamp);
  const ageDays = ageMs / 86400000;
  if (ageDays <= 7) return 0.75;
  if (ageDays <= 30) return 0.35;
  if (ageDays <= 90) return 0.1;
  return 0;
}

function tokenize(query) {
  return String(query || '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}
