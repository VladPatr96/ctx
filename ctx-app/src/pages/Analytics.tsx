import { useCallback, useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid, PieChart, Pie, Cell, Legend } from 'recharts';
import type { ApiClient } from '../api/client';
import type { ProviderAnalytics, TaskTypeBreakdown, CostAnalytics, RoutingDecision } from '../api/types';
import { HistoricalTrends } from '../components/analytics/HistoricalTrends';

interface AnalyticsPageProps {
  client: ApiClient;
}

const CHART_COLORS = ['#5fa2ff', '#34d399', '#fbbf24', '#f87171', '#a78bfa', '#f472b6', '#fb923c'];

function ProviderPerformance({ providers }: { providers: ProviderAnalytics[] }) {
  if (providers.length === 0) return null;

  const chartData = [...providers]
    .sort((a, b) => b.total_responses - a.total_responses)
    .map((p) => ({
      name: p.provider,
      responses: p.total_responses,
      wins: p.wins,
      winRate: typeof p.win_rate === 'string'
        ? parseFloat(p.win_rate.replace('%', ''))
        : +(p.win_rate * 100).toFixed(1),
      avgMs: p.avg_response_ms ? +p.avg_response_ms.toFixed(0) : 0,
      quality: p.avg_quality_rating ? +p.avg_quality_rating.toFixed(2) : 0,
      avgCost: p.avg_cost_usd ? +p.avg_cost_usd.toFixed(4) : 0,
      totalCost: p.total_cost_usd ? +p.total_cost_usd.toFixed(2) : 0,
    }));

  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header>
        <strong>Производительность провайдеров</strong>
        <span style={{ fontSize: 12, opacity: 0.7 }}>{providers.length} провайдеров</span>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        <div>
          <h4 style={{ margin: '0 0 8px 0', fontSize: 13 }}>Выигрыши</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
              <XAxis dataKey="name" stroke="var(--muted)" fontSize={10} />
              <YAxis stroke="var(--muted)" fontSize={11} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="wins" fill={CHART_COLORS[1]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div>
          <h4 style={{ margin: '0 0 8px 0', fontSize: 13 }}>Win Rate (%)</h4>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={chartData} margin={{ left: 10, right: 20, top: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-soft)" />
              <XAxis dataKey="name" stroke="var(--muted)" fontSize={10} />
              <YAxis stroke="var(--muted)" fontSize={11} />
              <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="winRate" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '6px 8px' }}>Провайдер</th>
              <th style={{ padding: '6px 8px' }}>Ответы</th>
              <th style={{ padding: '6px 8px' }}>Выигрыши</th>
              <th style={{ padding: '6px 8px' }}>Win Rate</th>
              <th style={{ padding: '6px 8px' }}>Среднее время (мс)</th>
              <th style={{ padding: '6px 8px' }}>Качество</th>
              <th style={{ padding: '6px 8px' }}>Ср. стоимость</th>
              <th style={{ padding: '6px 8px' }}>Всего ($)</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((p, i) => (
              <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '4px 8px' }}><strong>{p.name}</strong></td>
                <td style={{ padding: '4px 8px' }}>{p.responses}</td>
                <td style={{ padding: '4px 8px' }}>{p.wins}</td>
                <td style={{ padding: '4px 8px' }}>{p.winRate}%</td>
                <td style={{ padding: '4px 8px' }}>{p.avgMs > 0 ? p.avgMs : '—'}</td>
                <td style={{ padding: '4px 8px' }}>{p.quality > 0 ? p.quality : '—'}</td>
                <td style={{ padding: '4px 8px' }}>{p.avgCost > 0 ? `$${p.avgCost.toFixed(4)}` : '—'}</td>
                <td style={{ padding: '4px 8px' }}>{p.totalCost > 0 ? `$${p.totalCost.toFixed(2)}` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TaskTypePerformance({ taskTypes }: { taskTypes: TaskTypeBreakdown[] }) {
  if (taskTypes.length === 0) return null;

  const grouped = taskTypes.reduce<Record<string, TaskTypeBreakdown[]>>((acc, tt) => {
    if (!acc[tt.task_type]) acc[tt.task_type] = [];
    acc[tt.task_type].push(tt);
    return acc;
  }, {});

  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header>
        <strong>Производительность по типам задач</strong>
        <span style={{ fontSize: 12, opacity: 0.7 }}>{Object.keys(grouped).length} типов</span>
      </header>

      {Object.entries(grouped).map(([taskType, providers]) => {
        const chartData = providers.map((p) => ({
          name: p.provider,
          responses: p.total_responses,
          wins: p.wins,
          winRate: typeof p.win_rate === 'string'
            ? parseFloat(p.win_rate.replace('%', ''))
            : +(p.win_rate * 100).toFixed(1),
          avgMs: p.avg_response_ms ? +p.avg_response_ms.toFixed(0) : 0,
        }));

        return (
          <div key={taskType} style={{ marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 13, textTransform: 'uppercase', opacity: 0.8 }}>
              {taskType}
            </h4>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={chartData} layout="vertical" margin={{ left: 60, right: 20, top: 5, bottom: 5 }}>
                <XAxis type="number" stroke="var(--muted)" fontSize={11} />
                <YAxis type="category" dataKey="name" stroke="var(--muted)" fontSize={11} width={55} />
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
                <Bar dataKey="winRate" fill={CHART_COLORS[2]} radius={[0, 4, 4, 0]} name="Win Rate %" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        );
      })}
    </div>
  );
}

function CostOverview({ costs }: { costs: CostAnalytics }) {
  if (!costs || costs.total_responses === 0) return null;

  const pieData = costs.by_provider
    .filter((p) => p.total_cost_usd > 0)
    .map((p, i) => ({
      name: p.provider,
      value: +p.total_cost_usd.toFixed(4),
      color: CHART_COLORS[i % CHART_COLORS.length],
    }));

  const tableData = costs.by_provider.map((p) => ({
    provider: p.provider,
    totalCost: p.total_cost_usd.toFixed(4),
    responses: p.total_responses,
    avgCost: p.avg_cost_per_response ? p.avg_cost_per_response.toFixed(6) : '—',
  }));

  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header>
        <strong>Анализ затрат</strong>
        <span style={{ fontSize: 12, opacity: 0.7 }}>
          Всего: ${costs.total_cost_usd.toFixed(4)} ({costs.total_responses} ответов)
        </span>
      </header>

      {costs.potential_savings_usd !== null && costs.potential_savings_usd > 0 && (
        <div
          style={{
            padding: 12,
            background: 'var(--success-bg, rgba(52, 211, 153, 0.1))',
            border: '1px solid var(--success, #34d399)',
            borderRadius: 8,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          <strong>💡 Потенциал экономии:</strong> ${costs.potential_savings_usd.toFixed(4)} (
          {costs.savings_percentage?.toFixed(1)}%)
          {costs.cheapest_provider && (
            <div style={{ marginTop: 4, opacity: 0.8 }}>
              Самый дешёвый: <strong>{costs.cheapest_provider}</strong> (
              ${costs.cheapest_avg_cost?.toFixed(6)}/ответ)
            </div>
          )}
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 16 }}>
        {pieData.length > 0 && (
          <div>
            <h4 style={{ margin: '0 0 8px 0', fontSize: 13 }}>Распределение затрат</h4>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={(entry) => `${entry.name}: $${entry.value}`}
                  outerRadius={70}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <h4 style={{ margin: '0 0 8px 0', fontSize: 13 }}>Детали по провайдерам</h4>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
                <th style={{ padding: '6px 8px' }}>Провайдер</th>
                <th style={{ padding: '6px 8px' }}>Всего ($)</th>
                <th style={{ padding: '6px 8px' }}>Ответы</th>
                <th style={{ padding: '6px 8px' }}>Ср./ответ ($)</th>
              </tr>
            </thead>
            <tbody>
              {tableData.map((p, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                  <td style={{ padding: '4px 8px' }}><strong>{p.provider}</strong></td>
                  <td style={{ padding: '4px 8px' }}>${p.totalCost}</td>
                  <td style={{ padding: '4px 8px' }}>{p.responses}</td>
                  <td style={{ padding: '4px 8px' }}>${p.avgCost}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function AnalyticsPage({ client }: AnalyticsPageProps) {
  const [providers, setProviders] = useState<ProviderAnalytics[]>([]);
  const [taskTypes, setTaskTypes] = useState<TaskTypeBreakdown[]>([]);
  const [costs, setCosts] = useState<CostAnalytics | null>(null);
  const [decisions, setDecisions] = useState<RoutingDecision[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [adaptiveEnabled, setAdaptiveEnabled] = useState<boolean | null>(null);
  const [adaptiveMode, setAdaptiveMode] = useState<string>('');
  const [adaptiveToggling, setAdaptiveToggling] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [providersData, taskTypesData, costsData, routingHealth, routingConfig] = await Promise.all([
        client.getProviderAnalytics(),
        client.getTaskTypeBreakdown(),
        client.getCostAnalytics(),
        client.getRoutingHealth(200, 7),
        client.getRoutingConfig(),
      ]);
      setProviders(providersData);
      setTaskTypes(taskTypesData);
      setCosts(costsData);
      setDecisions(routingHealth.recent_decisions);
      setAdaptiveEnabled(routingConfig.config.enabled !== false);
      setAdaptiveMode(routingConfig.mode);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить аналитику');
    } finally {
      setLoading(false);
    }
  }, [client]);

  const handleExport = useCallback(async (format: 'csv' | 'json') => {
    setExporting(true);
    try {
      const data = await client.exportAnalytics(format);
      const blob = new Blob([data], { type: format === 'csv' ? 'text/csv' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${new Date().toISOString().split('T')[0]}.${format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось экспортировать данные');
    } finally {
      setExporting(false);
    }
  }, [client]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ margin: 0 }}>Аналитика провайдеров</h2>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="nav-btn" onClick={() => handleExport('json')} disabled={exporting || loading}>
            Экспорт JSON
          </button>
          <button type="button" className="nav-btn" onClick={() => handleExport('csv')} disabled={exporting || loading}>
            Экспорт CSV
          </button>
          <button type="button" className="nav-btn" onClick={fetchData} disabled={loading}>
            {loading ? 'Загрузка...' : 'Обновить'}
          </button>
        </div>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      {providers.length > 0 || taskTypes.length > 0 || costs ? (
        <>
          <ProviderPerformance providers={providers} />
          <CostOverview costs={costs!} />
          <TaskTypePerformance taskTypes={taskTypes} />

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 8px' }}>
            <h3 style={{ margin: 0 }}>Адаптивный роутинг</h3>
            <label style={{ display: 'inline-flex', alignItems: 'center', cursor: adaptiveToggling ? 'wait' : 'pointer', fontSize: 12, opacity: adaptiveToggling ? 0.6 : 1 }}>
              <span style={{
                display: 'inline-block',
                width: 36,
                height: 20,
                borderRadius: 10,
                background: adaptiveEnabled ? 'var(--accent, #5fa2ff)' : 'var(--border, #555)',
                position: 'relative',
                transition: 'background 0.2s',
                marginRight: 6,
              }}>
                <span style={{
                  position: 'absolute',
                  top: 2,
                  left: adaptiveEnabled ? 18 : 2,
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  background: '#fff',
                  transition: 'left 0.2s',
                }} />
              </span>
              <input
                type="checkbox"
                checked={!!adaptiveEnabled}
                disabled={adaptiveToggling}
                onChange={async (e) => {
                  const newValue = e.target.checked;
                  setAdaptiveToggling(true);
                  try {
                    await client.setRoutingConfig({ enabled: newValue });
                    setAdaptiveEnabled(newValue);
                    setAdaptiveMode(newValue ? 'adaptive' : 'config_off');
                  } catch (err) {
                    setError(err instanceof Error ? err.message : 'Не удалось переключить адаптивный роутинг');
                  } finally {
                    setAdaptiveToggling(false);
                  }
                }}
                style={{ display: 'none' }}
              />
              {adaptiveEnabled ? 'Вкл' : 'Выкл'}
            </label>
            {adaptiveMode && (
              <span style={{ fontSize: 11, opacity: 0.6 }}>
                режим: {adaptiveMode}
              </span>
            )}
          </div>
          <HistoricalTrends decisions={decisions} />
        </>
      ) : !loading && !error ? (
        <p style={{ opacity: 0.6 }}>
          Данных нет. Используйте consilium для сбора аналитики по провайдерам.
        </p>
      ) : null}
    </div>
  );
}
