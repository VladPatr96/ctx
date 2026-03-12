import { useCallback, useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { ApiClient } from '../api/client';
import type {
  RoutingAnomaly,
  RoutingExplainabilityDecision,
  RoutingExplainabilitySummary,
  ShellProviderCard,
} from '../api/types';
import { RoutingRuleBuilder } from '../components/routing/RoutingRuleBuilder';

interface RoutingPageProps {
  client: ApiClient;
}

const CHART_COLORS = ['#5fa2ff', '#34d399', '#fbbf24', '#f87171', '#a78bfa'];

function AnomalyAlerts({ anomalies }: { anomalies: RoutingAnomaly[] }) {
  if (anomalies.length === 0) return null;
  return (
    <div className="telemetry-grid" style={{ marginBottom: 16 }}>
      {anomalies.map((anomaly, index) => (
        <div
          key={`${anomaly.type}-${index}`}
          className="telemetry-card"
          style={{
            borderLeft: `4px solid ${anomaly.severity === 'critical' ? 'var(--error, #e53e3e)' : 'var(--warning, #d69e2e)'}`,
          }}
        >
          <header>
            <strong style={{ color: anomaly.severity === 'critical' ? 'var(--error, #e53e3e)' : 'var(--warning, #d69e2e)' }}>
              {anomaly.type}
            </strong>
          </header>
          <p style={{ margin: 0, fontSize: 13 }}>{anomaly.message}</p>
        </div>
      ))}
    </div>
  );
}

function ProviderDistribution({ distribution, total }: { distribution: Array<{ selected_provider: string; cnt: number }>; total: number }) {
  if (distribution.length === 0) return null;
  const chartData = [...distribution]
    .sort((a, b) => b.cnt - a.cnt)
    .map((entry) => ({
      name: entry.selected_provider,
      count: entry.cnt,
      pct: total > 0 ? +(entry.cnt / total * 100).toFixed(1) : 0,
    }));

  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header>
        <strong>Provider distribution</strong>
        <span style={{ fontSize: 12, opacity: 0.7 }}>{total} routing decisions</span>
      </header>
      <ResponsiveContainer width="100%" height={180}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 60, right: 20, top: 5, bottom: 5 }}>
          <XAxis type="number" stroke="var(--muted)" fontSize={11} />
          <YAxis type="category" dataKey="name" stroke="var(--muted)" fontSize={12} width={55} />
          <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
          <Bar dataKey="count" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ScoreTimeline({ decisions }: { decisions: RoutingExplainabilityDecision[] }) {
  if (decisions.length === 0) return null;
  const chartData = decisions.map((entry) => ({
    time: new Date(entry.timestamp).toLocaleTimeString(),
    score: +entry.finalScore.toFixed(3),
  }));

  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header><strong>Routing score timeline</strong></header>
      <ResponsiveContainer width="100%" height={200}>
        <LineChart data={chartData} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
          <XAxis dataKey="time" stroke="var(--muted)" fontSize={10} />
          <YAxis stroke="var(--muted)" fontSize={11} domain={[0, 1]} />
          <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
          <Line type="monotone" dataKey="score" stroke={CHART_COLORS[0]} strokeWidth={2} dot={{ r: 3 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ExplainabilityOverview({ summary }: { summary: RoutingExplainabilitySummary }) {
  return (
    <div className="telemetry-grid" style={{ marginBottom: 16 }}>
      <div className="telemetry-card">
        <header><strong>Routing mode</strong></header>
        <div style={{ fontSize: 14 }}>{summary.mode}</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>alpha {summary.readiness.alpha.toFixed(3)}</div>
      </div>
      <div className="telemetry-card">
        <header><strong>Feedback loop</strong></header>
        <div style={{ fontSize: 14 }}>{summary.feedback.total} events</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{summary.feedback.negative} negative / {summary.feedback.positive} positive</div>
      </div>
      <div className="telemetry-card">
        <header><strong>Readiness</strong></header>
        <div style={{ fontSize: 14 }}>{summary.readiness.isReady ? 'adaptive enabled' : 'warming up'}</div>
        <div style={{ fontSize: 12, opacity: 0.7 }}>{summary.readiness.totalRuns} completed runs</div>
      </div>
    </div>
  );
}

function FeedbackProviderTable({ summary }: { summary: RoutingExplainabilitySummary }) {
  if (summary.feedback.byProvider.length === 0) return null;
  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header><strong>Provider feedback</strong></header>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '6px 8px' }}>Provider</th>
              <th style={{ padding: '6px 8px' }}>Feedback</th>
              <th style={{ padding: '6px 8px' }}>Score</th>
              <th style={{ padding: '6px 8px' }}>Breakdown</th>
            </tr>
          </thead>
          <tbody>
            {summary.feedback.byProvider.map((entry) => (
              <tr key={entry.provider} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '4px 8px' }}><strong>{entry.provider}</strong></td>
                <td style={{ padding: '4px 8px' }}>{entry.total}</td>
                <td style={{ padding: '4px 8px' }}>{entry.score.toFixed(2)}</td>
                <td style={{ padding: '4px 8px' }}>{entry.positive} positive / {entry.neutral} neutral / {entry.negative} negative</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DecisionCard({
  decision,
  disabled,
  onFeedback,
}: {
  decision: RoutingExplainabilityDecision;
  disabled: boolean;
  onFeedback: (decision: RoutingExplainabilityDecision, verdict: 'positive' | 'neutral' | 'negative') => Promise<void>;
}) {
  const feedbackButtons: Array<{ verdict: 'positive' | 'neutral' | 'negative'; label: string }> = [
    { verdict: 'positive', label: 'Positive' },
    { verdict: 'neutral', label: 'Neutral' },
    { verdict: 'negative', label: 'Negative' },
  ];

  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <strong>{decision.explanation.headline}</strong>
        <span style={{ fontSize: 12, opacity: 0.7 }}>{new Date(decision.timestamp).toLocaleString()}</span>
      </header>
      <p style={{ marginTop: 8, marginBottom: 8, fontSize: 13 }}>{decision.explanation.summary}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 8, marginBottom: 12 }}>
        <Metric label="Final score" value={decision.finalScore.toFixed(3)} />
        <Metric label="Mode" value={decision.routingMode} />
        <Metric label="Runner-up" value={decision.runnerUp || 'n/a'} />
        <Metric label="Feedback" value={decision.feedback.verdict} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8, marginBottom: 12 }}>
        <Metric label="Static" value={decision.contributions.static.toFixed(3)} />
        <Metric label="Evaluation" value={decision.contributions.evaluation.toFixed(3)} />
        <Metric label="Feedback" value={decision.contributions.feedback.toFixed(3)} />
        <Metric label="Explore" value={decision.contributions.exploration.toFixed(3)} />
      </div>
      <ul style={{ margin: '0 0 12px 18px', padding: 0, fontSize: 12 }}>
        {decision.explanation.factors.map((factor) => (
          <li key={factor}>{factor}</li>
        ))}
      </ul>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {feedbackButtons.map((entry) => (
          <button
            key={entry.verdict}
            type="button"
            className="nav-btn"
            disabled={disabled || decision.id == null}
            onClick={() => void onFeedback(decision, entry.verdict)}
          >
            {entry.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: '8px 10px', border: '1px solid var(--border)', borderRadius: 10 }}>
      <div style={{ fontSize: 11, opacity: 0.7 }}>{label}</div>
      <div style={{ fontSize: 13, fontWeight: 600 }}>{value}</div>
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  ready: '#34d399',
  degraded: '#fbbf24',
  offline: '#f87171',
};

function ProviderHealthStrip({ client }: { client: ApiClient }) {
  const [cards, setCards] = useState<ShellProviderCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    client.getShellSummary()
      .then((summary) => setCards(summary.providers.cards))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [client]);

  if (loading || cards.length === 0) return null;

  return (
    <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '16px' }}>
      {cards.map((card) => (
        <div
          key={card.provider}
          style={{
            flex: '1 1 140px',
            padding: '10px 12px',
            border: `1px solid ${STATUS_COLORS[card.status] || 'var(--border)'}`,
            borderLeft: `4px solid ${STATUS_COLORS[card.status] || 'var(--border)'}`,
            borderRadius: '8px',
            background: 'var(--surface)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <strong style={{ fontSize: '13px' }}>{card.provider}</strong>
            <span style={{
              fontSize: '10px',
              padding: '2px 6px',
              borderRadius: '4px',
              background: STATUS_COLORS[card.status] || 'var(--muted)',
              color: card.status === 'degraded' ? '#000' : '#fff',
              fontWeight: 'bold',
              textTransform: 'uppercase',
            }}>
              {card.status}
            </span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--muted)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px' }}>
            <span>Latency: {card.avgLatencyMs}ms</span>
            <span>Success: {(card.successRate * 100).toFixed(0)}%</span>
            <span>Calls: {card.calls}</span>
            <span>Failures: {card.failures}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export function RoutingPage({ client }: RoutingPageProps) {
  const [data, setData] = useState<RoutingExplainabilitySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'analytics' | 'rules'>('rules');
  const [submittingDecisionId, setSubmittingDecisionId] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.getRoutingExplainability(20, 7);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load routing explainability');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (activeTab === 'analytics') {
      void fetchData();
    }
  }, [activeTab, fetchData]);

  const submitFeedback = useCallback(async (decision: RoutingExplainabilityDecision, verdict: 'positive' | 'neutral' | 'negative') => {
    if (decision.id == null) return;
    setSubmittingDecisionId(decision.id);
    setError(null);
    try {
      await client.submitRoutingFeedback({
        decisionId: decision.id,
        provider: decision.selectedProvider,
        taskType: decision.taskType,
        verdict,
      });
      await fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save routing feedback');
    } finally {
      setSubmittingDecisionId(null);
    }
  }, [client, fetchData]);

  return (
    <div>
      <ProviderHealthStrip client={client} />

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Adaptive routing</h2>
        {activeTab === 'analytics' && (
          <button type="button" className="nav-btn" onClick={() => void fetchData()} disabled={loading}>
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
        <button
          type="button"
          style={{ background: 'transparent', borderBottom: activeTab === 'rules' ? '2px solid var(--primary)' : '2px solid transparent', padding: '8px 4px', borderRadius: 0, color: activeTab === 'rules' ? 'var(--text)' : 'var(--muted)' }}
          onClick={() => setActiveTab('rules')}
        >
          Rules
        </button>
        <button
          type="button"
          style={{ background: 'transparent', borderBottom: activeTab === 'analytics' ? '2px solid var(--primary)' : '2px solid transparent', padding: '8px 4px', borderRadius: 0, color: activeTab === 'analytics' ? 'var(--text)' : 'var(--muted)' }}
          onClick={() => setActiveTab('analytics')}
        >
          Explainability
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      {activeTab === 'rules' && <RoutingRuleBuilder />}

      {activeTab === 'analytics' && data ? (
        <>
          <AnomalyAlerts anomalies={data.anomalies} />
          <ExplainabilityOverview summary={data} />
          <ProviderDistribution distribution={data.distribution} total={data.totals.totalDecisions} />
          <ScoreTimeline decisions={data.decisions} />
          <FeedbackProviderTable summary={data} />
          <h3>Recent decisions</h3>
          {data.decisions.length === 0 ? (
            <p style={{ fontSize: 13, opacity: 0.6 }}>No routing decisions recorded yet.</p>
          ) : (
            data.decisions.map((decision) => (
              <DecisionCard
                key={decision.id ?? `${decision.timestamp}-${decision.selectedProvider}`}
                decision={decision}
                disabled={submittingDecisionId === decision.id}
                onFeedback={submitFeedback}
              />
            ))
          )}
        </>
      ) : null}

      {activeTab === 'analytics' && !loading && !error && !data ? (
        <p style={{ opacity: 0.6 }}>No explainability data yet. Record routing decisions first.</p>
      ) : null}
    </div>
  );
}
