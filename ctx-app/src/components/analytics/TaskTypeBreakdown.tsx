import { useCallback, useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { ApiClient } from '../../api/client';
import type { TaskTypeBreakdown as TaskTypeBreakdownData } from '../../api/types';

interface TaskTypeBreakdownProps {
  client: ApiClient;
}

const CHART_COLORS = ['#5fa2ff', '#34d399', '#fbbf24', '#f87171', '#a78bfa'];

function parseWinRate(winRate: number | string): number {
  if (typeof winRate === 'string') {
    return parseFloat(winRate.replace('%', ''));
  }
  return winRate * 100;
}

function TaskTypeOverview({ data }: { data: TaskTypeBreakdownData[] }) {
  if (data.length === 0) return null;

  const byTaskType = data.reduce((acc, item) => {
    if (!acc[item.task_type]) {
      acc[item.task_type] = {
        task_type: item.task_type,
        total_responses: 0,
        wins: 0,
        avg_response_ms: [] as number[],
        avg_confidence: [] as number[],
      };
    }
    acc[item.task_type].total_responses += item.total_responses;
    acc[item.task_type].wins += item.wins;
    if (item.avg_response_ms != null) {
      acc[item.task_type].avg_response_ms.push(item.avg_response_ms);
    }
    if (item.avg_confidence != null) {
      acc[item.task_type].avg_confidence.push(item.avg_confidence);
    }
    return acc;
  }, {} as Record<string, {
    task_type: string;
    total_responses: number;
    wins: number;
    avg_response_ms: number[];
    avg_confidence: number[];
  }>);

  const chartData = Object.values(byTaskType)
    .map((t) => ({
      name: t.task_type,
      count: t.total_responses,
      wins: t.wins,
      winRate: t.total_responses > 0 ? +(t.wins / t.total_responses * 100).toFixed(1) : 0,
      avgLatency: t.avg_response_ms.length > 0 ? +(t.avg_response_ms.reduce((a, b) => a + b, 0) / t.avg_response_ms.length).toFixed(0) : null,
      avgConfidence: t.avg_confidence.length > 0 ? +(t.avg_confidence.reduce((a, b) => a + b, 0) / t.avg_confidence.length).toFixed(3) : null,
    }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header><strong>Распределение по типам задач</strong><span style={{ fontSize: 12, opacity: 0.7 }}>{data.length} записей</span></header>
      <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 30)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
          <XAxis type="number" stroke="var(--muted)" fontSize={11} />
          <YAxis type="category" dataKey="name" stroke="var(--muted)" fontSize={12} width={75} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            formatter={(value: number | undefined, name: string | undefined) => {
              if (value == null) return ['—', name ?? ''];
              if (name === 'winRate') return [`${value}%`, 'Win Rate'];
              return [value, name ?? ''];
            }}
          />
          <Bar dataKey="count" fill={CHART_COLORS[0]} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function WinRateByTaskType({ data }: { data: TaskTypeBreakdownData[] }) {
  if (data.length === 0) return null;

  const byTaskType = data.reduce((acc, item) => {
    if (!acc[item.task_type]) {
      acc[item.task_type] = { total_responses: 0, wins: 0 };
    }
    acc[item.task_type].total_responses += item.total_responses;
    acc[item.task_type].wins += item.wins;
    return acc;
  }, {} as Record<string, { total_responses: number; wins: number }>);

  const chartData = Object.entries(byTaskType)
    .map(([name, stats]) => ({
      name,
      winRate: stats.total_responses > 0 ? +(stats.wins / stats.total_responses * 100).toFixed(1) : 0,
      count: stats.total_responses,
    }))
    .sort((a, b) => b.winRate - a.winRate);

  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header><strong>Win Rate по типам задач</strong></header>
      <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 30)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
          <XAxis type="number" stroke="var(--muted)" fontSize={11} domain={[0, 100]} />
          <YAxis type="category" dataKey="name" stroke="var(--muted)" fontSize={12} width={75} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            formatter={(value: number | undefined) => value != null ? [`${value}%`, 'Win Rate'] : ['—', 'Win Rate']}
          />
          <Bar dataKey="winRate" radius={[0, 4, 4, 0]}>
            {chartData.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function LatencyByTaskType({ data }: { data: TaskTypeBreakdownData[] }) {
  if (data.length === 0) return null;

  const byTaskType = data.reduce((acc, item) => {
    if (item.avg_response_ms == null) return acc;
    if (!acc[item.task_type]) {
      acc[item.task_type] = [];
    }
    acc[item.task_type].push(item.avg_response_ms);
    return acc;
  }, {} as Record<string, number[]>);

  const chartData = Object.entries(byTaskType)
    .map(([name, latencies]) => ({
      name,
      avgLatency: latencies.length > 0 ? +(latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(0) : 0,
    }))
    .filter(d => d.avgLatency > 0)
    .sort((a, b) => a.avgLatency - b.avgLatency);

  if (chartData.length === 0) return null;

  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header><strong>Средняя задержка по типам задач (мс)</strong></header>
      <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * 30)}>
        <BarChart data={chartData} layout="vertical" margin={{ left: 80, right: 20, top: 5, bottom: 5 }}>
          <XAxis type="number" stroke="var(--muted)" fontSize={11} />
          <YAxis type="category" dataKey="name" stroke="var(--muted)" fontSize={12} width={75} />
          <Tooltip
            contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }}
            formatter={(value: number | undefined) => value != null ? [`${value}ms`, 'Средняя задержка'] : ['—', 'Средняя задержка']}
          />
          <Bar dataKey="avgLatency" fill={CHART_COLORS[2]} radius={[0, 4, 4, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function ProvidersByTaskType({ data }: { data: TaskTypeBreakdownData[] }) {
  if (data.length === 0) return null;

  const taskTypes = Array.from(new Set(data.map(d => d.task_type))).sort();

  return (
    <div style={{ marginTop: 16 }}>
      <h3>Провайдеры по типам задач</h3>
      {taskTypes.map((taskType) => {
        const taskData = data
          .filter(d => d.task_type === taskType)
          .sort((a, b) => parseWinRate(b.win_rate) - parseWinRate(a.win_rate));

        if (taskData.length === 0) return null;

        return (
          <div key={taskType} className="telemetry-card" style={{ marginBottom: 16 }}>
            <header><strong>{taskType}</strong><span style={{ fontSize: 12, opacity: 0.7 }}>{taskData.reduce((sum, d) => sum + d.total_responses, 0)} ответов</span></header>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '6px 8px' }}>Провайдер</th>
                    <th style={{ padding: '6px 8px' }}>Ответы</th>
                    <th style={{ padding: '6px 8px' }}>Победы</th>
                    <th style={{ padding: '6px 8px' }}>Win Rate</th>
                    <th style={{ padding: '6px 8px' }}>Ср. задержка</th>
                    <th style={{ padding: '6px 8px' }}>Ср. уверенность</th>
                    <th style={{ padding: '6px 8px' }}>Ср. стоимость</th>
                  </tr>
                </thead>
                <tbody>
                  {taskData.map((d, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '4px 8px' }}><strong>{d.provider}</strong></td>
                      <td style={{ padding: '4px 8px' }}>{d.total_responses}</td>
                      <td style={{ padding: '4px 8px' }}>{d.wins}</td>
                      <td style={{ padding: '4px 8px' }}>{typeof d.win_rate === 'string' ? d.win_rate : `${(d.win_rate * 100).toFixed(1)}%`}</td>
                      <td style={{ padding: '4px 8px' }}>{d.avg_response_ms != null ? `${d.avg_response_ms.toFixed(0)}ms` : '—'}</td>
                      <td style={{ padding: '4px 8px' }}>{d.avg_confidence != null ? d.avg_confidence.toFixed(3) : '—'}</td>
                      <td style={{ padding: '4px 8px' }}>{d.avg_cost_usd != null ? `$${d.avg_cost_usd.toFixed(4)}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function TaskTypeBreakdown({ client }: TaskTypeBreakdownProps) {
  const [data, setData] = useState<TaskTypeBreakdownData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.getTaskTypeBreakdown();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить аналитику по типам задач');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Аналитика по типам задач</h2>
        <button type="button" className="nav-btn" onClick={fetchData} disabled={loading}>
          {loading ? 'Загрузка...' : 'Обновить'}
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      {data.length > 0 ? (
        <>
          <TaskTypeOverview data={data} />
          <WinRateByTaskType data={data} />
          <LatencyByTaskType data={data} />
          <ProvidersByTaskType data={data} />
        </>
      ) : !loading && !error ? (
        <p style={{ opacity: 0.6 }}>Нет данных по типам задач. Убедитесь, что активирована аналитика consilium.</p>
      ) : null}
    </div>
  );
}
