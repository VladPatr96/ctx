import { useEffect, useState, type MouseEvent } from 'react';
import type { ApiClient, ConsiliumReplayQuery } from '../../api/client';
import type { ConsiliumReplayArchive } from '../../api/types';
import { useAppStore } from '../../store/useAppStore';

interface ConsiliumReplayPanelProps {
  client: ApiClient;
  project?: string | null;
}

export function ConsiliumReplayPanel({ client, project }: ConsiliumReplayPanelProps) {
  const setActiveTab = useAppStore((state) => state.setActiveTab);
  const [archive, setArchive] = useState<ConsiliumReplayArchive | null>(null);
  const [requestedRunId, setRequestedRunId] = useState<string | null>(null);
  const [projectFilter, setProjectFilter] = useState(project || '');
  const [providerFilter, setProviderFilter] = useState('');
  const [consensusFilter, setConsensusFilter] = useState<'all' | 'consensus' | 'open'>('all');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<'markdown' | 'json' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setProjectFilter(project || '');
    setRequestedRunId(null);
  }, [project]);

  useEffect(() => {
    setRequestedRunId(null);
  }, [projectFilter, providerFilter, consensusFilter]);

  useEffect(() => {
    let cancelled = false;

    async function loadReplay() {
      setLoading(true);
      setError(null);
      try {
        const query: ConsiliumReplayQuery = {
          runId: requestedRunId || undefined,
          project: projectFilter || undefined,
          provider: providerFilter || undefined,
          consensus: consensusFilter,
        };
        const nextArchive = await client.getConsiliumReplay(8, query);
        if (cancelled) return;
        setArchive(nextArchive);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load consilium replay');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadReplay();

    return () => {
      cancelled = true;
    };
  }, [client, consensusFilter, projectFilter, providerFilter, requestedRunId]);

  async function handleExport(format: 'markdown' | 'json') {
    if (!archive?.selectedRunId) return;
    setExporting(format);
    setError(null);
    try {
      const artifact = await client.exportConsiliumReplay(archive.selectedRunId, format, {
        project: projectFilter || undefined,
        provider: providerFilter || undefined,
        consensus: consensusFilter,
      });
      downloadTextArtifact(
        artifact.filename,
        artifact.content,
        format === 'json' ? 'application/json' : 'text/markdown',
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to export decision trail');
    } finally {
      setExporting(null);
    }
  }

  const decisions = archive?.decisions || [];
  const replay = archive?.replay || null;
  const selectedRunId = archive?.selectedRunId || null;
  const availableProjects = archive?.filters.availableProjects || [];
  const availableProviders = archive?.filters.availableProviders || [];
  const consensusCounts = archive?.filters.consensusCounts || { all: 0, consensus: 0, open: 0 };

  function handleKnowledgeNavigation(event: MouseEvent<HTMLAnchorElement>, href: string) {
    event.preventDefault();
    if (typeof window === 'undefined') return;
    const url = new URL(href, window.location.href);
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.pushState(window.history.state, '', nextUrl);
    setActiveTab('knowledge');
  }

  return (
    <div className="panel" style={{ display: 'grid', gap: 16 }}>
      <header style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <div>
            <h4 style={{ margin: 0 }}>Decision Archive</h4>
            <div style={{ marginTop: 4, fontSize: 12, color: 'var(--muted)' }}>
              {loading ? 'loading...' : `${decisions.length} archived decisions`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              type="button"
              onClick={() => void handleExport('markdown')}
              disabled={!selectedRunId || exporting !== null}
              style={actionButtonStyle}
            >
              {exporting === 'markdown' ? 'Exporting MD...' : 'Export MD'}
            </button>
            <button
              type="button"
              onClick={() => void handleExport('json')}
              disabled={!selectedRunId || exporting !== null}
              style={actionButtonStyle}
            >
              {exporting === 'json' ? 'Exporting JSON...' : 'Export JSON'}
            </button>
          </div>
        </div>

        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
          <label style={filterLabelStyle}>
            <span>Project</span>
            <select value={projectFilter} onChange={(event) => setProjectFilter(event.target.value)} style={filterSelectStyle}>
              <option value="">All projects</option>
              {availableProjects.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.value} ({entry.count})
                </option>
              ))}
            </select>
          </label>

          <label style={filterLabelStyle}>
            <span>Provider</span>
            <select value={providerFilter} onChange={(event) => setProviderFilter(event.target.value)} style={filterSelectStyle}>
              <option value="">All providers</option>
              {availableProviders.map((entry) => (
                <option key={entry.value} value={entry.value}>
                  {entry.value} ({entry.count})
                </option>
              ))}
            </select>
          </label>

          <label style={filterLabelStyle}>
            <span>Consensus</span>
            <select
              value={consensusFilter}
              onChange={(event) => setConsensusFilter(event.target.value as 'all' | 'consensus' | 'open')}
              style={filterSelectStyle}
            >
              <option value="all">All ({consensusCounts.all})</option>
              <option value="consensus">Consensus ({consensusCounts.consensus})</option>
              <option value="open">Open ({consensusCounts.open})</option>
            </select>
          </label>
        </div>
      </header>

      {error ? (
        <div className="telemetry-card" style={{ padding: 12, color: 'var(--danger)' }}>
          {error}
        </div>
      ) : null}

      {!loading && decisions.length === 0 ? (
        <div className="telemetry-card" style={{ padding: 16, color: 'var(--muted)' }}>
          Archived consilium runs not found for the current filters.
        </div>
      ) : null}

      {decisions.length > 0 ? (
        <div style={{ display: 'grid', gap: 16, gridTemplateColumns: 'minmax(240px, 320px) minmax(0, 1fr)' }}>
          <aside style={{ display: 'grid', gap: 8, alignContent: 'start' }}>
            {decisions.map((decision) => {
              const active = decision.runId === selectedRunId;
              return (
                <button
                  key={decision.runId}
                  type="button"
                  onClick={() => setRequestedRunId(decision.runId)}
                  style={{
                    textAlign: 'left',
                    border: active ? '1px solid var(--primary)' : '1px solid var(--border)',
                    background: active ? 'rgba(59, 130, 246, 0.08)' : 'var(--surface)',
                    borderRadius: 10,
                    padding: 12,
                    display: 'grid',
                    gap: 6,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                    <strong style={{ fontSize: 13 }}>{truncate(decision.topic, 46)}</strong>
                    <span style={{ fontSize: 11, color: 'var(--muted)' }}>
                      {decision.consensus ? 'consensus' : 'open'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                    {decision.project} · {formatTimestamp(decision.startedAt)}
                  </div>
                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
                    <span>{decision.roundsCount} rounds</span>
                    <span>{decision.providersResponded.length} providers</span>
                    <span>{formatDuration(decision.durationMs)}</span>
                  </div>
                </button>
              );
            })}
          </aside>

          <section style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
            {replay ? (
              <>
                <article className="telemetry-card" style={{ padding: 12, display: 'grid', gap: 10 }}>
                  <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                    <div style={{ display: 'grid', gap: 4 }}>
                      <strong>{replay.decision.topic}</strong>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {replay.decision.project} · run {replay.decision.runId.slice(0, 8)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
                      <span>{replay.decision.mode}</span>
                      <span>{formatDuration(replay.decision.durationMs)}</span>
                      <span>{replay.decision.proposedBy || 'no winner'}</span>
                    </div>
                  </header>

                  {replay.decision.decisionSummary ? (
                    <p style={{ margin: 0, lineHeight: 1.5 }}>{replay.decision.decisionSummary}</p>
                  ) : (
                    <p style={{ margin: 0, lineHeight: 1.5, color: 'var(--muted)' }}>
                      Decision summary not captured for this run.
                    </p>
                  )}

                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {replay.decision.archiveReferences.map((reference) => (
                      <a
                        key={reference.id}
                        href={reference.href}
                        target={reference.type === 'github_issue' ? '_blank' : undefined}
                        rel={reference.type === 'github_issue' ? 'noreferrer' : undefined}
                        style={chipLinkStyle}
                      >
                        {reference.label}
                      </a>
                    ))}
                  </div>
                </article>

                <article className="telemetry-card" style={{ padding: 12, display: 'grid', gap: 12 }}>
                  <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <strong>Knowledge Context</strong>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {replay.knowledgeContext ? `${replay.knowledgeContext.entries.length} linked entries` : 'KB unavailable'}
                    </span>
                  </header>

                  {replay.knowledgeContext ? (
                    <>
                      <div style={{ display: 'grid', gap: 4 }}>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>Replay query</span>
                        <code style={{ whiteSpace: 'pre-wrap' }}>{replay.knowledgeContext.query}</code>
                      </div>

                      {replay.knowledgeContext.continuity ? (
                        <div style={{ display: 'grid', gap: 6, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
                          <div style={metricCardStyle}>
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Snapshot</span>
                            <strong>{replay.knowledgeContext.continuity.snapshotExists ? 'available' : 'missing'}</strong>
                          </div>
                          <div style={metricCardStyle}>
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Task</span>
                            <strong>{replay.knowledgeContext.continuity.snapshotTask || 'n/a'}</strong>
                          </div>
                          <div style={metricCardStyle}>
                            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Branch</span>
                            <strong>{replay.knowledgeContext.continuity.snapshotBranch || 'n/a'}</strong>
                          </div>
                        </div>
                      ) : null}

                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {replay.knowledgeContext.actions.map((action) => (
                          <a
                            key={action.id}
                            href={action.href}
                            onClick={(event) => handleKnowledgeNavigation(event, action.href)}
                            style={chipLinkStyle}
                          >
                            {action.label}
                          </a>
                        ))}
                      </div>

                      {replay.knowledgeContext.entries.length > 0 ? (
                        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
                          {replay.knowledgeContext.entries.map((entry) => (
                            <article key={entry.entryId} style={knowledgeEntryCardStyle}>
                              <header style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                                <strong>{entry.title}</strong>
                                <span style={{ fontSize: 12, color: 'var(--muted)' }}>{entry.category}</span>
                              </header>
                              <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                {entry.project}
                                {entry.updatedAt ? ` • ${formatTimestamp(entry.updatedAt)}` : ''}
                              </div>
                              {entry.retrieval.matchReason ? (
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>{entry.retrieval.matchReason}</div>
                              ) : null}
                              <p style={{ margin: 0, lineHeight: 1.5 }}>{entry.snippet}</p>
                              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                <a
                                  href={entry.href}
                                  onClick={(event) => handleKnowledgeNavigation(event, entry.href)}
                                  style={chipLinkStyle}
                                >
                                  Open in Knowledge
                                </a>
                                {entry.githubUrl ? (
                                  <a href={entry.githubUrl} target="_blank" rel="noreferrer" style={chipLinkStyle}>
                                    Source
                                  </a>
                                ) : null}
                              </div>
                            </article>
                          ))}
                        </div>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                          No related knowledge entries found for this replay yet.
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                      Knowledge runtime is unavailable for this replay.
                    </div>
                  )}
                </article>

                <article className="telemetry-card" style={{ padding: 12, display: 'grid', gap: 10 }}>
                  <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <strong>Provider Summary</strong>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {replay.providers.length} providers
                    </span>
                  </header>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 }}>
                    {replay.providers.map((provider) => (
                      <div
                        key={provider.provider}
                        style={{
                          border: provider.wasChosen ? '1px solid rgba(34, 197, 94, 0.5)' : '1px solid var(--border)',
                          borderRadius: 10,
                          padding: 10,
                          display: 'grid',
                          gap: 6,
                          background: provider.wasChosen ? 'rgba(34, 197, 94, 0.08)' : 'var(--surface)',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                          <strong>{provider.provider}</strong>
                          <span style={{ fontSize: 12, color: 'var(--muted)' }}>{provider.status}</span>
                        </div>
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
                          <span>{formatDuration(provider.responseMs)}</span>
                          <span>{formatConfidence(provider.confidence)}</span>
                          <span>{provider.model || 'model n/a'}</span>
                        </div>
                        {provider.keyIdea ? (
                          <div style={{ fontSize: 13, lineHeight: 1.5 }}>{provider.keyIdea}</div>
                        ) : null}
                        {provider.error ? (
                          <div style={{ fontSize: 12, color: 'var(--danger)' }}>{provider.error}</div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </article>

                <article className="telemetry-card" style={{ padding: 12, display: 'grid', gap: 12 }}>
                  <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <strong>Round Replay</strong>
                    <span style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {replay.rounds.length} rounds
                    </span>
                  </header>
                  <div style={{ display: 'grid', gap: 10 }}>
                    {replay.rounds.map((round) => (
                      <section
                        key={round.round}
                        style={{
                          border: '1px solid var(--border)',
                          borderRadius: 10,
                          padding: 12,
                          display: 'grid',
                          gap: 10,
                          background: 'var(--surface)',
                        }}
                      >
                        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
                          <strong>Round {round.round}</strong>
                          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
                            <span>{round.completedResponses} completed</span>
                            <span>{round.failedResponses} failed</span>
                            <span>{formatDuration(round.avgResponseMs)}</span>
                            <span>{formatConfidence(round.avgConfidence)}</span>
                          </div>
                        </header>
                        <div style={{ display: 'grid', gap: 8 }}>
                          {round.responses.map((response) => (
                            <details
                              key={`${round.round}-${response.provider}-${response.alias}`}
                              style={{
                                border: '1px solid var(--border)',
                                borderRadius: 8,
                                padding: 10,
                                background: response.status === 'completed' || response.status === 'success'
                                  ? 'rgba(34, 197, 94, 0.05)'
                                  : 'rgba(239, 68, 68, 0.05)',
                              }}
                            >
                              <summary style={{ cursor: 'pointer', listStyle: 'none' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                                  <strong>{response.alias}</strong>
                                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
                                    <span>{response.provider}</span>
                                    <span>{response.status}</span>
                                    <span>{formatDuration(response.responseMs)}</span>
                                    <span>{formatConfidence(response.confidence)}</span>
                                  </div>
                                </div>
                              </summary>
                              <div style={{ marginTop: 10, display: 'grid', gap: 8 }}>
                                <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                                  position changed: {response.positionChanged ? 'yes' : 'no'}
                                </div>
                                <pre
                                  style={{
                                    margin: 0,
                                    whiteSpace: 'pre-wrap',
                                    maxHeight: 260,
                                    overflowY: 'auto',
                                    background: 'var(--surface-alt)',
                                    padding: 10,
                                    borderRadius: 8,
                                  }}
                                >
                                  {response.responseText || 'No archived response text.'}
                                </pre>
                              </div>
                            </details>
                          ))}
                        </div>
                      </section>
                    ))}
                  </div>
                </article>
              </>
            ) : (
              <div className="telemetry-card" style={{ padding: 16, color: 'var(--muted)' }}>
                Select a consilium run to inspect its archived rounds.
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function downloadTextArtifact(filename: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function truncate(value: string, max: number) {
  return value.length <= max ? value : `${value.slice(0, max - 3)}...`;
}

function formatTimestamp(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatDuration(value: number | null) {
  if (value === null || value === undefined) return 'n/a';
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

function formatConfidence(value: number | null) {
  if (value === null || value === undefined) return 'confidence n/a';
  return `${Math.round(value * 100)}% confidence`;
}

const actionButtonStyle = {
  fontSize: 12,
  padding: '6px 10px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface-alt)',
  color: 'var(--text)',
  cursor: 'pointer',
} as const;

const chipLinkStyle = {
  fontSize: 12,
  padding: '4px 8px',
  borderRadius: 999,
  border: '1px solid var(--border)',
  color: 'var(--text)',
  textDecoration: 'none',
} as const;

const metricCardStyle = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 10,
  display: 'grid',
  gap: 4,
  background: 'var(--surface)',
} as const;

const knowledgeEntryCardStyle = {
  border: '1px solid var(--border)',
  borderRadius: 10,
  padding: 10,
  display: 'grid',
  gap: 8,
  background: 'var(--surface)',
} as const;

const filterLabelStyle = {
  display: 'grid',
  gap: 6,
  fontSize: 12,
  color: 'var(--muted)',
} as const;

const filterSelectStyle = {
  padding: '6px 8px',
  borderRadius: 8,
  border: '1px solid var(--border)',
  background: 'var(--surface)',
  color: 'var(--text)',
} as const;
