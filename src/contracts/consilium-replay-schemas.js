import { z } from 'zod';
import {
  IsoDatetimeSchema,
  ProviderKeySchema,
  UnitIntervalSchema,
} from './runtime-schemas.js';

export const ConsiliumReplayArchiveReferenceSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['dashboard_replay', 'github_issue']),
  label: z.string().min(1),
  href: z.string().min(1),
}).strict();

export const ConsiliumReplayKnowledgeActionSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['knowledge_search', 'knowledge_project']),
  label: z.string().min(1),
  href: z.string().min(1),
  project: z.string().min(1),
  query: z.string().nullable(),
}).strict();

export const ConsiliumReplayKnowledgeEntrySchema = z.object({
  entryId: z.number().int().positive(),
  project: z.string().min(1),
  category: z.string().min(1),
  title: z.string().min(1),
  snippet: z.string().min(1),
  href: z.string().min(1),
  updatedAt: IsoDatetimeSchema.nullable(),
  source: z.string().nullable(),
  githubUrl: z.string().nullable(),
  retrieval: z.object({
    score: z.number().nullable(),
    matchReason: z.string().nullable(),
  }).strict(),
}).strict();

export const ConsiliumReplayKnowledgeContinuitySchema = z.object({
  snapshotExists: z.boolean(),
  snapshotTask: z.string().nullable(),
  snapshotBranch: z.string().nullable(),
  recentDecisionTitle: z.string().nullable(),
  suggestionTitles: z.array(z.string().min(1)),
}).strict();

export const ConsiliumReplayKnowledgeContextSchema = z.object({
  project: z.string().min(1),
  query: z.string().min(1),
  actions: z.array(ConsiliumReplayKnowledgeActionSchema),
  entries: z.array(ConsiliumReplayKnowledgeEntrySchema),
  continuity: ConsiliumReplayKnowledgeContinuitySchema.nullable(),
}).strict();

export const ConsiliumReplayConsensusFilterSchema = z.enum(['all', 'consensus', 'open']);

export const ConsiliumReplayFilterOptionSchema = z.object({
  value: z.string().min(1),
  count: z.number().int().nonnegative(),
}).strict();

export const ConsiliumReplayDecisionSchema = z.object({
  runId: z.string().min(1),
  project: z.string().min(1),
  topic: z.string().min(1),
  mode: z.string().min(1),
  startedAt: IsoDatetimeSchema,
  endedAt: IsoDatetimeSchema.nullable(),
  durationMs: z.number().int().nonnegative().nullable(),
  roundsCount: z.number().int().nonnegative(),
  providersInvoked: z.array(ProviderKeySchema),
  providersResponded: z.array(ProviderKeySchema),
  proposedBy: ProviderKeySchema.nullable(),
  consensus: z.boolean(),
  decisionSummary: z.string().nullable(),
  archiveReferences: z.array(ConsiliumReplayArchiveReferenceSchema),
}).strict();

export const ConsiliumReplayProviderSchema = z.object({
  provider: ProviderKeySchema,
  model: z.string().nullable(),
  status: z.string().min(1),
  responseMs: z.number().int().nonnegative().nullable(),
  confidence: UnitIntervalSchema.nullable(),
  keyIdea: z.string().nullable(),
  wasChosen: z.boolean(),
  error: z.string().nullable(),
}).strict();

export const ConsiliumReplayRoundResponseSchema = z.object({
  provider: ProviderKeySchema,
  alias: z.string().min(1),
  status: z.string().min(1),
  responseMs: z.number().int().nonnegative().nullable(),
  confidence: UnitIntervalSchema.nullable(),
  positionChanged: z.boolean(),
  responseText: z.string().nullable(),
}).strict();

export const ConsiliumReplayRoundSchema = z.object({
  round: z.number().int().positive(),
  completedResponses: z.number().int().nonnegative(),
  failedResponses: z.number().int().nonnegative(),
  avgResponseMs: z.number().int().nonnegative().nullable(),
  avgConfidence: UnitIntervalSchema.nullable(),
  positionsChanged: z.number().int().nonnegative(),
  responses: z.array(ConsiliumReplayRoundResponseSchema),
}).strict();

export const ConsiliumReplayEntrySchema = z.object({
  decision: ConsiliumReplayDecisionSchema,
  providers: z.array(ConsiliumReplayProviderSchema),
  rounds: z.array(ConsiliumReplayRoundSchema),
  knowledgeContext: ConsiliumReplayKnowledgeContextSchema.nullable(),
}).strict();

export const ConsiliumReplayFiltersSchema = z.object({
  applied: z.object({
    project: z.string().nullable(),
    provider: ProviderKeySchema.nullable(),
    consensus: ConsiliumReplayConsensusFilterSchema,
  }).strict(),
  availableProjects: z.array(ConsiliumReplayFilterOptionSchema),
  availableProviders: z.array(ConsiliumReplayFilterOptionSchema),
  consensusCounts: z.object({
    all: z.number().int().nonnegative(),
    consensus: z.number().int().nonnegative(),
    open: z.number().int().nonnegative(),
  }).strict(),
}).strict();

export const ConsiliumReplayArchiveSchema = z.object({
  generatedAt: IsoDatetimeSchema,
  selectedRunId: z.string().nullable(),
  filters: ConsiliumReplayFiltersSchema,
  decisions: z.array(ConsiliumReplayDecisionSchema),
  replay: ConsiliumReplayEntrySchema.nullable(),
}).strict();

export const ConsiliumReplayExportSchema = z.object({
  generatedAt: IsoDatetimeSchema,
  runId: z.string().min(1),
  format: z.enum(['markdown', 'json']),
  filename: z.string().min(1),
  content: z.string().min(1),
}).strict();

export function createConsiliumReplayArchive(input) {
  return ConsiliumReplayArchiveSchema.parse(input);
}

export function createConsiliumReplayExport(input) {
  return ConsiliumReplayExportSchema.parse(input);
}

export function buildConsiliumReplayArchive({
  decisions = [],
  allDecisions = decisions,
  detail = null,
  knowledgeContext = null,
  selectedRunId = null,
  filters = {},
  generatedAt = new Date().toISOString(),
  replayPath = '/api/consilium/replay',
} = {}) {
  const normalizedDecisions = decisions.map((decision) => normalizeDecision(decision, replayPath));
  const normalizedAllDecisions = allDecisions.map((decision) => normalizeDecision(decision, replayPath));
  const replay = detail?.run
    ? {
        decision: normalizedDecisions.find((decision) => decision.runId === detail.run.run_id)
          || normalizeDecision(detail.run, replayPath),
        providers: normalizeProviderRows(detail.providerResponses),
        rounds: normalizeRoundRows(detail.roundSummary, detail.roundResponses),
        knowledgeContext: normalizeKnowledgeContext(knowledgeContext),
      }
    : null;

  return createConsiliumReplayArchive({
    generatedAt: normalizeIsoDatetime(generatedAt),
    selectedRunId: replay?.decision.runId || normalizeNullableText(selectedRunId) || normalizedDecisions[0]?.runId || null,
    filters: buildFilters(normalizedAllDecisions, filters),
    decisions: normalizedDecisions,
    replay,
  });
}

export function buildConsiliumReplayExport(replay, {
  format = 'markdown',
  generatedAt = new Date().toISOString(),
} = {}) {
  const replayEntry = ConsiliumReplayEntrySchema.parse(replay);
  const normalizedFormat = format === 'json' ? 'json' : 'markdown';
  const shortRunId = replayEntry.decision.runId.slice(0, 8);
  const filename = normalizedFormat === 'json'
    ? `consilium-decision-trail-${shortRunId}.json`
    : `consilium-decision-trail-${shortRunId}.md`;
  const content = normalizedFormat === 'json'
    ? `${JSON.stringify(replayEntry, null, 2)}\n`
    : renderReplayMarkdown(replayEntry);

  return createConsiliumReplayExport({
    generatedAt: normalizeIsoDatetime(generatedAt),
    runId: replayEntry.decision.runId,
    format: normalizedFormat,
    filename,
    content,
  });
}

export function buildConsiliumReplayKnowledgeContext({
  project,
  query,
  actions = [],
  entries = [],
  continuity = null,
} = {}) {
  return ConsiliumReplayKnowledgeContextSchema.parse({
    project: normalizeText(project, 'unknown'),
    query: normalizeText(query, 'consilium'),
    actions: normalizeKnowledgeActions(actions),
    entries: normalizeKnowledgeEntries(entries),
    continuity: normalizeKnowledgeContinuity(continuity),
  });
}

function normalizeDecision(row, replayPath) {
  const runId = normalizeText(row?.run_id, 'unknown-run');
  return {
    runId,
    project: normalizeText(row?.project, 'unknown'),
    topic: normalizeText(row?.topic, 'consilium'),
    mode: normalizeText(row?.mode, 'providers'),
    startedAt: normalizeIsoDatetime(row?.started_at),
    endedAt: normalizeNullableIsoDatetime(row?.ended_at),
    durationMs: normalizeNullableDuration(row?.duration_ms),
    roundsCount: normalizeNonNegativeInt(row?.rounds),
    providersInvoked: normalizeProviderArray(row?.providers_invoked),
    providersResponded: normalizeProviderArray(row?.providers_responded),
    proposedBy: normalizeNullableProvider(row?.proposed_by),
    consensus: Boolean(row?.consensus_reached),
    decisionSummary: normalizeNullableText(row?.decision_summary),
    archiveReferences: buildArchiveReferences(runId, row?.github_issue_url, replayPath),
  };
}

function normalizeProviderRows(rows = []) {
  return (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      provider: normalizeProvider(row?.provider),
      model: normalizeNullableText(row?.model),
      status: normalizeText(row?.status, 'completed'),
      responseMs: normalizeNullableDuration(row?.response_ms),
      confidence: normalizeNullableConfidence(row?.confidence),
      keyIdea: normalizeNullableText(row?.key_idea),
      wasChosen: Boolean(row?.was_chosen),
      error: normalizeNullableText(row?.error_message),
    }))
    .sort((left, right) => left.provider.localeCompare(right.provider));
}

function normalizeRoundRows(roundSummary = [], roundResponses = []) {
  const summaryByRound = new Map();
  for (const row of Array.isArray(roundSummary) ? roundSummary : []) {
    summaryByRound.set(normalizePositiveInt(row?.round, 1), row);
  }

  const responsesByRound = new Map();
  for (const row of Array.isArray(roundResponses) ? roundResponses : []) {
    const round = normalizePositiveInt(row?.round, 1);
    const current = responsesByRound.get(round) || [];
    current.push({
      provider: normalizeProvider(row?.provider),
      alias: normalizeText(row?.alias || row?.provider, 'participant'),
      status: normalizeText(row?.status, 'completed'),
      responseMs: normalizeNullableDuration(row?.response_ms),
      confidence: normalizeNullableConfidence(row?.confidence),
      positionChanged: Boolean(row?.position_changed),
      responseText: normalizeNullableText(row?.response_text),
    });
    responsesByRound.set(round, current);
  }

  const rounds = new Set([
    ...summaryByRound.keys(),
    ...responsesByRound.keys(),
  ]);

  return [...rounds]
    .sort((left, right) => left - right)
    .map((round) => {
      const summary = summaryByRound.get(round) || {};
      const responses = (responsesByRound.get(round) || [])
        .sort((left, right) => left.provider.localeCompare(right.provider));
      const completedResponses = summary.completed === undefined
        ? responses.filter((response) => response.status === 'completed' || response.status === 'success').length
        : normalizeNonNegativeInt(summary.completed);
      const totalResponses = summary.total === undefined
        ? responses.length
        : normalizeNonNegativeInt(summary.total);

      return {
        round,
        completedResponses,
        failedResponses: Math.max(0, totalResponses - completedResponses),
        avgResponseMs: normalizeNullableDuration(summary.avg_ms),
        avgConfidence: normalizeNullableConfidence(summary.avg_confidence),
        positionsChanged: summary.positions_changed === undefined
          ? responses.filter((response) => response.positionChanged).length
          : normalizeNonNegativeInt(summary.positions_changed),
        responses,
      };
    });
}

function buildArchiveReferences(runId, githubIssueUrl, replayPath) {
  const refs = [{
    id: `${runId}:dashboard_replay`,
    type: 'dashboard_replay',
    label: 'Replay API',
    href: `${replayPath}?run_id=${encodeURIComponent(runId)}`,
  }];

  const issueHref = normalizeNullableText(githubIssueUrl);
  if (issueHref) {
    refs.push({
      id: `${runId}:github_issue`,
      type: 'github_issue',
      label: 'GitHub issue',
      href: issueHref,
    });
  }

  return refs;
}

function normalizeKnowledgeContext(context) {
  if (!context) return null;
  return buildConsiliumReplayKnowledgeContext(context);
}

function normalizeKnowledgeActions(actions = []) {
  return (Array.isArray(actions) ? actions : [])
    .map((action, index) => ({
      id: normalizeText(action?.id, `knowledge-action-${index + 1}`),
      type: action?.type === 'knowledge_project' ? 'knowledge_project' : 'knowledge_search',
      label: normalizeText(action?.label, 'Open in Knowledge'),
      href: normalizeText(action?.href, '?tab=knowledge'),
      project: normalizeText(action?.project, 'unknown'),
      query: normalizeNullableText(action?.query),
    }))
    .sort((left, right) => left.label.localeCompare(right.label));
}

function normalizeKnowledgeEntries(entries = []) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry) => ({
      entryId: normalizePositiveInt(entry?.entryId ?? entry?.id, 1),
      project: normalizeText(entry?.project, 'unknown'),
      category: normalizeText(entry?.category, 'unknown'),
      title: normalizeText(entry?.title, 'Untitled entry'),
      snippet: normalizeText(entry?.snippet ?? summarizeText(entry?.body), 'No knowledge summary available.'),
      href: normalizeText(entry?.href, '?tab=knowledge'),
      updatedAt: normalizeNullableIsoDatetime(entry?.updatedAt ?? entry?.updated_at ?? entry?.created_at),
      source: normalizeNullableText(entry?.source),
      githubUrl: normalizeNullableText(entry?.githubUrl ?? entry?.github_url),
      retrieval: {
        score: normalizeNullableNumber(entry?.retrieval?.score),
        matchReason: normalizeNullableText(entry?.retrieval?.matchReason),
      },
    }))
    .sort((left, right) => {
      const leftScore = left.retrieval.score ?? -1;
      const rightScore = right.retrieval.score ?? -1;
      if (leftScore !== rightScore) return rightScore - leftScore;
      return left.title.localeCompare(right.title);
    });
}

function normalizeKnowledgeContinuity(continuity) {
  if (!continuity) return null;

  const recentDecisionTitle = normalizeNullableText(continuity?.recentDecisionTitle)
    || (Array.isArray(continuity?.recentDecisions) && continuity.recentDecisions.length > 0
      ? normalizeNullableText(continuity.recentDecisions[0]?.title)
      : null);
  const suggestionTitles = Array.isArray(continuity?.suggestionTitles) && continuity.suggestionTitles.length > 0
    ? continuity.suggestionTitles.map((title) => normalizeNullableText(title)).filter(Boolean)
    : (Array.isArray(continuity?.suggestions) ? continuity.suggestions : [])
      .map((suggestion) => normalizeNullableText(suggestion?.title))
      .filter(Boolean)
      .slice(0, 3);

  return {
    snapshotExists: continuity?.snapshotExists === undefined
      ? Boolean(continuity?.snapshot?.exists)
      : Boolean(continuity?.snapshotExists),
    snapshotTask: normalizeNullableText(continuity?.snapshotTask)
      || normalizeNullableText(continuity?.snapshot?.task),
    snapshotBranch: normalizeNullableText(continuity?.snapshotBranch)
      || normalizeNullableText(continuity?.snapshot?.branch),
    recentDecisionTitle,
    suggestionTitles,
  };
}

function buildFilters(decisions, filters) {
  const project = normalizeNullableText(filters?.project);
  const provider = normalizeNullableProvider(filters?.provider);
  const consensus = normalizeConsensus(filters?.consensus);
  const availableProjects = buildOptionCounts(decisions.map((decision) => decision.project));
  const availableProviders = buildOptionCounts(decisions.flatMap((decision) => [
    ...decision.providersInvoked,
    ...decision.providersResponded,
    ...(decision.proposedBy ? [decision.proposedBy] : []),
  ]));
  const consensusCounts = {
    all: decisions.length,
    consensus: decisions.filter((decision) => decision.consensus).length,
    open: decisions.filter((decision) => !decision.consensus).length,
  };

  return {
    applied: {
      project,
      provider,
      consensus,
    },
    availableProjects,
    availableProviders,
    consensusCounts,
  };
}

function buildOptionCounts(values) {
  const counts = new Map();
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => left[0].localeCompare(right[0]))
    .map(([value, count]) => ({ value, count }));
}

function normalizeProviderArray(raw) {
  if (Array.isArray(raw)) {
    return raw.map((value) => normalizeProvider(value));
  }

  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.map((value) => normalizeProvider(value));
      }
    } catch {
      return [normalizeProvider(raw)];
    }
  }

  return [];
}

function normalizeProvider(value) {
  const text = String(value || '').trim().toLowerCase();
  return text || 'unknown';
}

function normalizeNullableProvider(value) {
  const text = String(value || '').trim().toLowerCase();
  return text ? text : null;
}

function normalizeConsensus(value) {
  return value === 'consensus' || value === 'open' ? value : 'all';
}

function normalizeText(value, fallback) {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeNullableText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function normalizePositiveInt(value, fallback) {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return fallback;
  return Math.round(num);
}

function normalizeNonNegativeInt(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num);
}

function normalizeNullableDuration(value) {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.round(num);
}

function normalizeNullableConfidence(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num <= 0) return 0;
  if (num >= 1) return 1;
  return +num.toFixed(2);
}

function normalizeNullableNumber(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  return +num.toFixed(2);
}

function normalizeIsoDatetime(value) {
  const text = String(value || '').trim();
  const parsed = text ? new Date(text) : new Date();
  if (Number.isNaN(parsed.getTime())) return new Date().toISOString();
  return parsed.toISOString();
}

function normalizeNullableIsoDatetime(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function renderReplayMarkdown(replay) {
  const lines = [
    '# Consilium Decision Trail',
    '',
    `- Run: ${replay.decision.runId}`,
    `- Project: ${replay.decision.project}`,
    `- Topic: ${replay.decision.topic}`,
    `- Mode: ${replay.decision.mode}`,
    `- Started: ${replay.decision.startedAt}`,
    `- Duration: ${replay.decision.durationMs === null ? 'n/a' : `${replay.decision.durationMs}ms`}`,
    `- Consensus: ${replay.decision.consensus ? 'yes' : 'no'}`,
    `- Proposed by: ${replay.decision.proposedBy || 'n/a'}`,
    '',
    '## Decision Summary',
    '',
    replay.decision.decisionSummary || 'No decision summary captured.',
    '',
    '## Knowledge Context',
    '',
  ];

  if (replay.knowledgeContext) {
    lines.push(`- Project: ${replay.knowledgeContext.project}`);
    lines.push(`- Query: ${replay.knowledgeContext.query}`);
    lines.push(`- Related entries: ${replay.knowledgeContext.entries.length}`);
    if (replay.knowledgeContext.continuity) {
      lines.push(`- Snapshot: ${replay.knowledgeContext.continuity.snapshotExists ? 'yes' : 'no'}`);
      lines.push(`- Snapshot task: ${replay.knowledgeContext.continuity.snapshotTask || 'n/a'}`);
      lines.push(`- Snapshot branch: ${replay.knowledgeContext.continuity.snapshotBranch || 'n/a'}`);
    }
    lines.push('');
    lines.push('### Knowledge Actions');
    lines.push('');
    lines.push(...replay.knowledgeContext.actions.map((action) => `- ${action.label}: ${action.href}`));
    lines.push('');
    lines.push('### Related Knowledge');
    lines.push('');
    if (replay.knowledgeContext.entries.length === 0) {
      lines.push('No related knowledge entries found.');
      lines.push('');
    } else {
      for (const entry of replay.knowledgeContext.entries) {
        lines.push(`- [${entry.category}] ${entry.title}`);
        lines.push(`  - Link: ${entry.href}`);
        lines.push(`  - Match: ${entry.retrieval.matchReason || 'n/a'}`);
        lines.push(`  - Summary: ${entry.snippet}`);
        if (entry.githubUrl) {
          lines.push(`  - GitHub: ${entry.githubUrl}`);
        }
      }
      lines.push('');
    }
  } else {
    lines.push('No linked knowledge context available.');
    lines.push('');
  }

  lines.push('## Archive References');
  lines.push('');
  lines.push(...replay.decision.archiveReferences.map((reference) => `- ${reference.label}: ${reference.href}`));
  lines.push('');
  lines.push('## Provider Summary');
  lines.push('');

  for (const provider of replay.providers) {
    lines.push(`### ${provider.provider}`);
    lines.push(`- Status: ${provider.status}`);
    lines.push(`- Model: ${provider.model || 'n/a'}`);
    lines.push(`- Response ms: ${provider.responseMs === null ? 'n/a' : provider.responseMs}`);
    lines.push(`- Confidence: ${provider.confidence === null ? 'n/a' : provider.confidence}`);
    lines.push(`- Chosen: ${provider.wasChosen ? 'yes' : 'no'}`);
    lines.push(`- Key idea: ${provider.keyIdea || 'n/a'}`);
    lines.push(`- Error: ${provider.error || 'n/a'}`);
    lines.push('');
  }

  lines.push('## Round Replay');
  lines.push('');

  for (const round of replay.rounds) {
    lines.push(`### Round ${round.round}`);
    lines.push(`- Completed: ${round.completedResponses}`);
    lines.push(`- Failed: ${round.failedResponses}`);
    lines.push(`- Avg response ms: ${round.avgResponseMs === null ? 'n/a' : round.avgResponseMs}`);
    lines.push(`- Avg confidence: ${round.avgConfidence === null ? 'n/a' : round.avgConfidence}`);
    lines.push(`- Positions changed: ${round.positionsChanged}`);
    lines.push('');

    for (const response of round.responses) {
      lines.push(`#### ${response.alias} (${response.provider})`);
      lines.push(`- Status: ${response.status}`);
      lines.push(`- Response ms: ${response.responseMs === null ? 'n/a' : response.responseMs}`);
      lines.push(`- Confidence: ${response.confidence === null ? 'n/a' : response.confidence}`);
      lines.push(`- Position changed: ${response.positionChanged ? 'yes' : 'no'}`);
      lines.push('');
      lines.push(response.responseText || 'No archived response text.');
      lines.push('');
    }
  }

  return `${lines.join('\n')}\n`;
}

function summarizeText(value, max = 180) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length <= max ? text : `${text.slice(0, max - 3)}...`;
}
