import { useCallback, useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import type { ApiClient } from '../api/client';
import type { RoutingHealthData, RoutingDecision, RoutingAnomaly } from '../api/types';
import { RoutingRuleBuilder } from '../components/routing/RoutingRuleBuilder';

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
              {a.severity === 'critical' ? 'КРИТИЧНО' : 'ВНИМАНИЕ'}: {a.type}
            </strong>
          </header>
          <p style={{ margin: 0, fontSize: 13 }}>{a.message}</p>
        </div>
      ))}
    </div>
  );
}

const CHART_COLORS = ['#5fa2ff', '#34d399', '#fbbf24', '#f87171', '#a78bfa'];

function ProviderDistribution({ distribution, total }: { distribution: Array<{ selected_provider: string; cnt: number }>; total: number }) {
  if (distribution.length === 0) return null;
  const chartData = [...distribution]
    .sort((a, b) => b.cnt - a.cnt)
    .map((d) => ({ name: d.selected_provider, count: d.cnt, pct: total > 0 ? +(d.cnt / total * 100).toFixed(1) : 0 }));
  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header><strong>Распределение по провайдерам</strong><span style={{ fontSize: 12, opacity: 0.7 }}>{total} решений</span></header>
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

function ScoreTimeline({ decisions }: { decisions: RoutingDecision[] }) {
  if (decisions.length === 0) return null;
  const chartData = decisions.map((d) => ({
    time: new Date(d.timestamp).toLocaleTimeString(),
    score: +d.final_score.toFixed(3),
    provider: d.selected_provider,
  }));
  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header><strong>Динамика оценок</strong></header>
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

function ScoreStats({ stats, total }: { stats: RoutingHealthData['stats']; total: number }) {
  if (!stats || total === 0) return null;
  const fmt = (v?: number) => v != null ? v.toFixed(3) : '—';
  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header><strong>Статистика оценок</strong></header>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 13 }}>
        <div>Средняя оценка: <strong>{fmt(stats.avg_score)}</strong></div>
        <div>Диапазон: {fmt(stats.min_score)} — {fmt(stats.max_score)}</div>
        <div>Средняя alpha: <strong>{fmt(stats.avg_alpha)}</strong></div>
        <div>Диапазон: {fmt(stats.min_alpha)} — {fmt(stats.max_alpha)}</div>
        <div>Среднее explore: <strong>{fmt(stats.avg_explore)}</strong></div>
        <div>Расхождений: <strong>{stats.diverged_count ?? 0}</strong></div>
      </div>
    </div>
  );
}

function RecentDecisions({ decisions }: { decisions: RoutingDecision[] }) {
  if (decisions.length === 0) {
    return <p style={{ fontSize: 13, opacity: 0.6 }}>Решений по роутингу пока нет.</p>;
  }
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
            <th style={{ padding: '6px 8px' }}>Время</th>
            <th style={{ padding: '6px 8px' }}>Тип</th>
            <th style={{ padding: '6px 8px' }}>Выбран</th>
            <th style={{ padding: '6px 8px' }}>Второй</th>
            <th style={{ padding: '6px 8px' }}>Оценка</th>
            <th style={{ padding: '6px 8px' }}>Дельта</th>
            <th style={{ padding: '6px 8px' }}>Режим</th>
            <th style={{ padding: '6px 8px' }}>Расх.</th>
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
  const [activeTab, setActiveTab] = useState<'analytics' | 'rules'>('rules');

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.getRoutingHealth(50, 1);
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить данные роутинга');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Адаптивный роутинг</h2>
        {activeTab === 'analytics' && (
          <button type="button" className="nav-btn" onClick={fetchData} disabled={loading}>
            {loading ? 'Загрузка...' : 'Обновить'}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: '16px', borderBottom: '1px solid var(--border)', marginBottom: '24px' }}>
        <button
          type="button"
          style={{ background: 'transparent', borderBottom: activeTab === 'rules' ? '2px solid var(--primary)' : '2px solid transparent', padding: '8px 4px', borderRadius: 0, color: activeTab === 'rules' ? 'var(--text)' : 'var(--muted)' }}
          onClick={() => setActiveTab('rules')}
        >
          Движок правил
        </button>
        <button
          type="button"
          style={{ background: 'transparent', borderBottom: activeTab === 'analytics' ? '2px solid var(--primary)' : '2px solid transparent', padding: '8px 4px', borderRadius: 0, color: activeTab === 'analytics' ? 'var(--text)' : 'var(--muted)' }}
          onClick={() => setActiveTab('analytics')}
        >
          Аналитика
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      {activeTab === 'rules' && (
        <RoutingRuleBuilder />
      )}

      {activeTab === 'analytics' && (
        data ? (
          <>
            <AnomalyAlerts anomalies={data.anomalies} />
            <ProviderDistribution distribution={data.distribution} total={data.total_decisions} />
            <ScoreTimeline decisions={data.recent_decisions} />
            <ScoreStats stats={data.stats} total={data.total_decisions} />
            <h3>Последние решения</h3>
            <RecentDecisions decisions={data.recent_decisions} />
          </>
        ) : !loading && !error ? (
          <p style={{ opacity: 0.6 }}>Данных нет. Включите CTX_ADAPTIVE_ROUTING=1 для сбора решений по роутингу.</p>
        ) : null
      )}
    </div>
  );
}
