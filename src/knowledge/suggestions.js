import { createKnowledgeSuggestionSummary } from '../contracts/knowledge-schemas.js';

export function buildKnowledgeSuggestionSummary({
  project,
  exportArtifact,
  now = new Date().toISOString(),
} = {}) {
  const suggestions = [];
  const templates = [];
  const continuity = exportArtifact?.continuity || null;
  const sessionEntry = continuity?.recentSessions?.[0] || null;
  const decisionEntry = continuity?.recentDecisions?.[0] || null;
  const errorEntry = continuity?.recentErrors?.[0] || null;

  if (continuity?.snapshot?.exists) {
    suggestions.push({
      id: 'resume-context',
      title: continuity.snapshot.task
        ? `Resume ${continuity.snapshot.task}`
        : 'Resume latest knowledge context',
      description: continuity.snapshot.branch
        ? `Continue on branch ${continuity.snapshot.branch}.`
        : 'Continue from the latest saved snapshot.',
      action: 'resume_context',
      sourceEntryIds: [],
    });
  }

  if (decisionEntry) {
    suggestions.push({
      id: `review-decision-${decisionEntry.id}`,
      title: `Review decision: ${decisionEntry.title}`,
      description: 'Use the latest architectural decision as a planning anchor.',
      action: 'review_decision',
      sourceEntryIds: [decisionEntry.id],
    });
    templates.push({
      id: `template-decision-${decisionEntry.id}`,
      title: `Decision follow-up: ${decisionEntry.title}`,
      description: 'Starter prompt for revisiting the latest decision artifact.',
      prompt: `Review the decision "${decisionEntry.title}" and update the implementation plan using the stored rationale: ${clip(decisionEntry.body)}`,
      sourceCategories: ['decision'],
      sourceEntryIds: [decisionEntry.id],
    });
  }

  if (errorEntry) {
    suggestions.push({
      id: `triage-error-${errorEntry.id}`,
      title: `Triage error memory: ${errorEntry.title}`,
      description: 'Check recent error memory before starting the next implementation step.',
      action: 'triage_error',
      sourceEntryIds: [errorEntry.id],
    });
    templates.push({
      id: `template-error-${errorEntry.id}`,
      title: `Error triage: ${errorEntry.title}`,
      description: 'Starter prompt for resolving a repeated error from archive memory.',
      prompt: `Investigate the recurring error "${errorEntry.title}" using this stored context: ${clip(errorEntry.body)}`,
      sourceCategories: ['error'],
      sourceEntryIds: [errorEntry.id],
    });
  }

  if (sessionEntry) {
    templates.push({
      id: `template-session-${sessionEntry.id}`,
      title: `Session restart: ${sessionEntry.title}`,
      description: 'Starter prompt for continuing the last recorded session.',
      prompt: `Continue the work from session "${sessionEntry.title}" and keep the next actions aligned with this summary: ${clip(sessionEntry.body)}`,
      sourceCategories: ['session-summary'],
      sourceEntryIds: [sessionEntry.id],
    });
  } else {
    suggestions.push({
      id: 'capture-session',
      title: 'Capture a fresh session summary',
      description: 'This project has no recent session-summary artifact yet.',
      action: 'capture_session',
      sourceEntryIds: [],
    });
  }

  return createKnowledgeSuggestionSummary({
    generatedAt: now,
    project,
    exportArtifact,
    suggestions,
    templates,
  });
}

function clip(text, max = 180) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 3)}...`;
}
