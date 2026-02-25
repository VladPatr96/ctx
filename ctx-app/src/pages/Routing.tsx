import { useCallback, useEffect, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { RoutingHealthData, RoutingDecision, RoutingAnomaly } from '../api/types';

interface RoutingPageProps {
  client: ApiClient;
}

function AnomalyAlerts({ anomalies }: { anomalies: RoutingAnomaly[] }) {
  if (anomalies.length === 0) return null;
  return (
    <div className="telemetry-grid" style={{ marginBottom: 16 }}>
      {anomalies.map((a, i) => (
        <div
          key={i}
          className="telemetry-card"
          style={{
            borderLeft: `4px solid ${a.severity === 'critical' ? 'var(--error, #e53e3e)' : 'var(--warning, #d69e2e)'}`,
          }}
        >
          <header>
            <strong style={{ color: a.severity === 'critical' ? 'var(--error, #e53e3e)' : 'var(--warning, #d69e2e)' }}>
              {a.severity === 'critical' ? 'CRITICAL' : 'WARN'}: {a.type}
            </strong>
          </header>
          <p style={{ margin: 0, fontSize: 13 }}>{a.message}</p>
        </div>
      ))}
    </div>
  );
}

function ProviderDistribution({ distribution, total }: { distribution: Array<{ selected_provider: string; cnt: number }>; total: number }) {
  if (distribution.length === 0) return null;
  const sorted = [...distribution].sort((a, b) => b.cnt - a.cnt);
  const colors = ['var(--primary, #4299e1)', 'var(--success, #48bb78)', 'var(--warning, #d69e2e)', 'var(--error, #e53e3e)', '#9f7aea'];
  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header><strong>Provider Distribution</strong><span style={{ fontSize: 12, opacity: 0.7 }}>{total} decisions</span></header>
      {sorted.map((d, i) => {
        const pct = total > 0 ? (d.cnt / total * 100) : 0;
        return (
          <div className="telemetry-row" key={d.selected_provider}>
            <span>{d.selected_provider}</span>
            <div className="telemetry-track">
              <div className="telemetry-bar" style={{ width: `${pct}%`, background: colors[i % colors.length] }} />
            </div>
            <span>{pct.toFixed(1)}% ({d.cnt})</span>
          </div>
        );
      })}
    </div>
  );
}

function ScoreStats({ stats, total }: { stats: RoutingHealthData['stats']; total: number }) {
  if (!stats || total === 0) return null;
  const fmt = (v?: number) => v != null ? v.toFixed(3) : '—';
  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header><strong>Score Statistics</strong></header>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
        <div>Avg Score: <strong>{fmt(stats.avg_score)}</strong></div>
        <div>Range: {fmt(stats.min_score)} — {fmt(stats.max_score)}</div>
        <div>Avg Alpha: <strong>{fmt(stats.avg_alpha)}</strong></div>
        <div>Range: {fmt(stats.min_alpha)} — {fmt(stats.max_alpha)}</div>
        <div>Avg Explore: <strong>{fmt(stats.avg_explore)}</strong></div>
        <div>Diverged: <strong>{stats.diverged_count ?? 0}</strong></div>
      </div>
    </div>
  );
}

function RecentDecisions({ decisions }: { decisions: RoutingDecision[] }) {
  if (decisions.length === 0) {
    return <p style={{ fontSize: 13, opacity: 0.6 }}>No routing decisions recorded yet.</p>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
            <th style={{ padding: '6px 8px' }}>Time</th>
            <th style={{ padding: '6px 8px' }}>Type</th>
            <th style={{ padding: '6px 8px' }}>Selected</th>
            <th style={{ padding: '6px 8px' }}>Runner-up</th>
            <th style={{ padding: '6px 8px' }}>Score</th>
            <th style={{ padding: '6px 8px' }}>Delta</th>
            <th style={{ padding: '6px 8px' }}>Mode</th>
            <th style={{ padding: '6px 8px' }}>Div</th>
          </tr>
        </thead>
        <tbody>
          {decisions.map((d, i) => (
            <tr key={d.id ?? i} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '4px 8px', whiteSpace: 'nowrap' }}>{new Date(d.timestamp).toLocaleTimeString()}</td>
              <td style={{ padding: '4px 8px' }}>{d.task_type}</td>
              <td style={{ padding: '4px 8px' }}><strong>{d.selected_provider}</strong></td>
              <td style={{ padding: '4px 8px' }}>{d.runner_up || '—'}</td>
              <td style={{ padding: '4px 8px' }}>{d.final_score.toFixed(3)}</td>
              <td style={{ padding: '4px 8px' }}>{d.delta != null ? d.delta.toFixed(3) : '—'}</td>
              <td style={{ padding: '4px 8px' }}>{d.routing_mode}</td>
              <td style={{ padding: '4px 8px' }}>{d.is_diverged ? 'Y' : ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RoutingPage({ client }: RoutingPageProps) {
  const [data, setData] = useState<RoutingHealthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.getRoutingHealth(50, 1);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load routing data');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Adaptive Routing</h2>
        <button type="button" className="nav-btn" onClick={fetchData} disabled={loading}>
          {loading ? 'Loading...' : 'Refresh'}
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      {data ? (
        <>
          <AnomalyAlerts anomalies={data.anomalies} />
          <ProviderDistribution distribution={data.distribution} total={data.total_decisions} />
          <ScoreStats stats={data.stats} total={data.total_decisions} />
          <h3>Recent Decisions</h3>
          <RecentDecisions decisions={data.recent_decisions} />
        </>
      ) : !loading && !error ? (
        <p style={{ opacity: 0.6 }}>No data available. Enable CTX_ADAPTIVE_ROUTING=1 to start collecting routing decisions.</p>
      ) : null}
    </div>
  );
}
