import { createKnowledgeContinuityDigest } from '../contracts/knowledge-schemas.js';

export function buildKnowledgeContinuityDigest({
  project,
  entries,
  snapshot,
  limit = 5,
  now = new Date().toISOString(),
} = {}) {
  const scoped = (entries || []).filter((entry) => entry.project === project);
  const recentSessions = scoped.filter((entry) => entry.category === 'session-summary').slice(0, limit);
  const recentDecisions = scoped.filter((entry) => entry.category === 'decision').slice(0, limit);
  const recentErrors = scoped.filter((entry) => entry.category === 'error').slice(0, limit);
  const suggestions = [];

  if (snapshot?.data) {
    suggestions.push({
      type: 'resume',
      title: snapshot.data.task ? `Resume task: ${snapshot.data.task}` : 'Resume latest project snapshot',
      description: snapshot.data.branch
        ? `Latest snapshot is on branch ${snapshot.data.branch}.`
        : 'Latest snapshot is available for this project.',
      entryId: null,
    });
  }

  if (recentDecisions[0]) {
    suggestions.push({
      type: 'decision',
      title: `Revisit decision: ${recentDecisions[0].title}`,
      description: 'Use the most recent architectural decision as continuity context.',
      entryId: recentDecisions[0].id,
    });
  }

  if (recentErrors[0]) {
    suggestions.push({
      type: 'error',
      title: `Check unresolved error memory: ${recentErrors[0].title}`,
      description: 'Recent error knowledge may still influence the next implementation step.',
      entryId: recentErrors[0].id,
    });
  }

  if (suggestions.length === 0 && scoped[0]) {
    suggestions.push({
      type: 'search',
      title: 'Search the latest knowledge artifacts',
      description: 'Use the stored archive as the continuity baseline for the next session.',
      entryId: scoped[0].id,
    });
  }

  return createKnowledgeContinuityDigest({
    generatedAt: now,
    project,
    snapshot: {
      exists: Boolean(snapshot?.data),
      createdAt: snapshot?.created_at || null,
      branch: snapshot?.data?.branch || null,
      task: snapshot?.data?.task || null,
      stage: snapshot?.data?.stage || null,
    },
    stats: {
      totalEntries: scoped.length,
      sessions: scoped.filter((entry) => entry.category === 'session-summary').length,
      decisions: scoped.filter((entry) => entry.category === 'decision').length,
      errors: scoped.filter((entry) => entry.category === 'error').length,
    },
    recentSessions,
    recentDecisions,
    recentErrors,
    suggestions,
  });
}
