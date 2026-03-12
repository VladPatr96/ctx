import type { CSSProperties } from 'react';
import type { ConsiliumObservability } from '../../api/types';

interface ConsiliumObservabilityPanelProps {
  observability: ConsiliumObservability;
}

export function ConsiliumObservabilityPanel({ observability }: ConsiliumObservabilityPanelProps) {
  const claimGraph = observability.claimGraph;
  const synthesis = observability.synthesis;

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 12,
        }}
      >
        <MetricCard
          label="Run"
          value={observability.runId ? observability.runId.slice(0, 8) : 'n/a'}
          hint={observability.topic}
        />
        <MetricCard
          label="Rounds"
          value={String(observability.rounds.length)}
          hint={observability.autoStop ? `auto-stop after R${observability.autoStop.stoppedAfterRound}` : 'full run'}
        />
        <MetricCard
          label="Duration"
          value={formatDuration(observability.totalDurationMs)}
          hint={observability.structured ? 'structured' : 'basic'}
        />
        <MetricCard
          label="Confidence"
          value={synthesis.confidence === null ? 'n/a' : `${Math.round(synthesis.confidence * 100)}%`}
          hint={synthesis.status || 'no synthesis'}
        />
        <MetricCard
          label="Claims"
          value={claimGraph ? String(claimGraph.total) : '0'}
          hint={claimGraph ? `${claimGraph.contestedCount} contested` : 'graph unavailable'}
        />
      </div>

      {synthesis.recommendation ? (
        <section className="telemetry-card" style={{ padding: 12, display: 'grid', gap: 8 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
            <strong>Recommendation</strong>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              {synthesis.provider || 'synthesis'}
            </span>
          </header>
          <p style={{ margin: 0, lineHeight: 1.5 }}>{synthesis.recommendation}</p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
            <span>Consensus: {synthesis.consensusPoints}</span>
            <span>Disputed: {synthesis.disputedPoints}</span>
          </div>
        </section>
      ) : null}

      {observability.trustMatrix.length > 0 ? (
        <section className="telemetry-card" style={{ padding: 12, display: 'grid', gap: 10 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
            <strong>Trust Matrix</strong>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>
              averaged across rounds
            </span>
          </header>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  <th style={tableHeaderStyle}>From</th>
                  {observability.participants.map((participant) => (
                    <th key={participant.alias} style={tableHeaderStyle}>
                      {participant.alias}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {observability.trustMatrix.map((row) => {
                  const scoreMap = new Map(row.scores.map((score) => [score.targetAlias, score.score]));
                  return (
                    <tr key={row.fromAlias}>
                      <td style={tableCellStyle}>
                        <strong>{row.fromAlias}</strong>
                        <div style={{ color: 'var(--muted)' }}>{row.fromProvider || 'n/a'}</div>
                      </td>
                      {observability.participants.map((participant) => {
                        const score = scoreMap.get(participant.alias);
                        return (
                          <td
                            key={`${row.fromAlias}-${participant.alias}`}
                            style={{
                              ...tableCellStyle,
                              background: score === undefined
                                ? 'transparent'
                                : `rgba(59, 130, 246, ${0.15 + (score * 0.55)})`,
                            }}
                          >
                            {score === undefined ? '—' : score.toFixed(2)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="telemetry-card" style={{ padding: 12, display: 'grid', gap: 12 }}>
        <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
          <strong>Round Timeline</strong>
          <span style={{ fontSize: 12, color: 'var(--muted)' }}>
            {observability.rounds.length} rounds
          </span>
        </header>
        <div style={{ display: 'grid', gap: 10 }}>
          {observability.rounds.map((round) => (
            <article
              key={round.round}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 10,
                padding: 12,
                background: 'var(--surface)',
                display: 'grid',
                gap: 10,
              }}
            >
              <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
                <strong>Round {round.round}</strong>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12, color: 'var(--muted)' }}>
                  <span>{round.successfulResponses} success</span>
                  <span>{round.failedResponses} failed</span>
                  <span>{round.claimsExtracted} claims</span>
                  <span>{round.newClaims} new</span>
                </div>
              </header>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8 }}>
                {round.responses.map((response) => (
                  <div
                    key={`${round.round}-${response.provider}-${response.alias}`}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: 10,
                      background: response.status === 'success' || response.status === 'completed'
                        ? 'rgba(34, 197, 94, 0.08)'
                        : 'rgba(239, 68, 68, 0.08)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                      <strong>{response.alias}</strong>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{response.provider}</span>
                    </div>
                    <div style={{ marginTop: 6, fontSize: 12, color: 'var(--muted)' }}>
                      {response.status}
                      {response.responseMs !== null ? ` · ${formatDuration(response.responseMs)}` : ''}
                    </div>
                    {response.error ? (
                      <div style={{ marginTop: 6, fontSize: 12, color: 'var(--danger)' }}>{response.error}</div>
                    ) : null}
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <article className="telemetry-card" style={{ padding: 12, display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{label}</span>
      <strong style={{ fontSize: 20 }}>{value}</strong>
      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{hint}</span>
    </article>
  );
}

function formatDuration(value: number) {
  if (value >= 1000) return `${(value / 1000).toFixed(1)}s`;
  return `${Math.round(value)}ms`;
}

const tableHeaderStyle: CSSProperties = {
  textAlign: 'left',
  padding: '8px 10px',
  borderBottom: '1px solid var(--border)',
  color: 'var(--muted)',
  fontWeight: 600,
};

const tableCellStyle: CSSProperties = {
  padding: '8px 10px',
  borderBottom: '1px solid var(--border)',
  verticalAlign: 'top',
};
