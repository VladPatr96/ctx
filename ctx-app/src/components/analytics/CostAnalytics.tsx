import { useCallback, useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import type { ApiClient } from '../../api/client';
import type { CostAnalytics as CostAnalyticsData } from '../../api/types';

interface CostAnalyticsProps {
  client: ApiClient;
}

const CHART_COLORS = ['#5fa2ff', '#34d399', '#fbbf24', '#f87171', '#a78bfa'];

function CostSummary({ data }: { data: CostAnalyticsData }) {
  const formatCost = (cost: number | null | undefined) => {
    if (cost == null) return '$0.00';
    return `$${cost.toFixed(4)}`;
  };

  const formatPercentage = (pct: number | null | undefined) => {
    if (pct == null) return '0%';
    return `${pct.toFixed(1)}%`;
  };

  return (
    <div className="telemetry-grid" style={{ marginBottom: 16 }}>
      <div className="telemetry-card">
        <header><strong>Общие расходы</strong></header>
        <div style={{ fontSize: 28, fontWeight: 'bold', color: 'var(--primary, #5fa2ff)' }}>
          {formatCost(data.total_cost_usd)}
        </div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
          {data.total_responses} запросов
        </div>
      </div>

      <div className="telemetry-card">
        <header><strong>Потенциальная экономия</strong></header>
        <div style={{ fontSize: 28, fontWeight: 'bold', color: 'var(--success, #34d399)' }}>
          {formatCost(data.potential_savings_usd)}
        </div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
          {formatPercentage(data.savings_percentage)} экономии
        </div>
      </div>

      <div className="telemetry-card">
        <header><strong>Самый дешевый провайдер</strong></header>
        <div style={{ fontSize: 20, fontWeight: 'bold', marginTop: 8 }}>
          {data.cheapest_provider || '—'}
        </div>
        <div style={{ fontSize: 13, opacity: 0.7, marginTop: 4 }}>
          в среднем {formatCost(data.cheapest_avg_cost)}
        </div>
      </div>
    </div>
  );
}

function CostByProviderChart({ data }: { data: CostAnalyticsData }) {
  if (data.by_provider.length === 0) return null;

  const chartData = [...data.by_provider]
    .sort((a, b) => b.total_cost_usd - a.total_cost_usd)
    .map((p) => ({
      name: p.provider,
      cost: +p.total_cost_usd.toFixed(4),
      responses: p.total_responses,
      avg: p.avg_cost_per_response != null ? +p.avg_cost_per_response.toFixed(4) : 0
    }));

  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header>
        <strong>Расходы по провайдерам</strong>
        <span style={{ fontSize: 12, opacity: 0.7 }}>Общая стоимость (USD)</span>
      </header>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={chartData} margin={{ left: 60, right: 20, top: 10, bottom: 5 }}>
          <XAxis dataKey="name" stroke="var(--muted)" fontSize={11} />
          <YAxis stroke="var(--muted)" fontSize={11} />
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12
            }}
            formatter={(value: number | undefined, name: string | undefined) => {
              if (value == null) return ['—', name ?? ''];
              if (name === 'cost') return [`$${value.toFixed(4)}`, 'Стоимость'];
              if (name === 'responses') return [value, 'Запросов'];
              return [value, name ?? ''];
            }}
          />
          <Bar dataKey="cost" fill={CHART_COLORS[0]} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CostDistributionPie({ data }: { data: CostAnalyticsData }) {
  if (data.by_provider.length === 0) return null;

  const chartData = data.by_provider.map((p) => ({
    name: p.provider,
    value: +p.total_cost_usd.toFixed(4)
  }));

  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header><strong>Распределение расходов</strong></header>
      <ResponsiveContainer width="100%" height={240}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={(entry) => `${entry.name}: $${entry.value.toFixed(4)}`}
            outerRadius={80}
            fill="#8884d8"
            dataKey="value"
          >
            {chartData.map((_, index) => (
              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: 'var(--surface)',
              border: '1px solid var(--border)',
              borderRadius: 8,
              fontSize: 12
            }}
            formatter={(value: number | undefined) => value != null ? `$${value.toFixed(4)}` : '—'}
          />
          <Legend
            verticalAlign="bottom"
            height={36}
            formatter={(value) => value}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

function CostDetailsTable({ data }: { data: CostAnalyticsData }) {
  if (data.by_provider.length === 0) {
    return <p style={{ fontSize: 13, opacity: 0.6 }}>Данных о расходах пока нет.</p>;
  }

  const sorted = [...data.by_provider].sort((a, b) => b.total_cost_usd - a.total_cost_usd);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
            <th style={{ padding: '6px 8px' }}>Провайдер</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Запросов</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Общая стоимость</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Средняя стоимость</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Доля расходов</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const percentage = data.total_cost_usd > 0
              ? (p.total_cost_usd / data.total_cost_usd * 100).toFixed(1)
              : '0.0';
            return (
              <tr key={p.provider} style={{ borderBottom: '1px solid var(--border)' }}>
                <td style={{ padding: '4px 8px' }}><strong>{p.provider}</strong></td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{p.total_responses}</td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                  ${p.total_cost_usd.toFixed(4)}
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                  {p.avg_cost_per_response != null ? `$${p.avg_cost_per_response.toFixed(4)}` : '—'}
                </td>
                <td style={{ padding: '4px 8px', textAlign: 'right' }}>{percentage}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function CostAnalytics({ client }: CostAnalyticsProps) {
  const [data, setData] = useState<CostAnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.getCostAnalytics();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить данные о расходах');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>Анализ расходов</h3>
        <button type="button" className="nav-btn" onClick={fetchData} disabled={loading}>
          {loading ? 'Загрузка...' : 'Обновить'}
        </button>
      </div>

      {error ? <div className="error-banner">{error}</div> : null}

      {data ? (
        <>
          <CostSummary data={data} />
          <div className="telemetry-grid" style={{ marginBottom: 16 }}>
            <CostByProviderChart data={data} />
            <CostDistributionPie data={data} />
          </div>
          <h4>Детали по провайдерам</h4>
          <CostDetailsTable data={data} />
        </>
      ) : !loading && !error ? (
        <p style={{ opacity: 0.6 }}>Данных о расходах нет. Убедитесь, что включен сбор информации о стоимости.</p>
      ) : null}
    </div>
  );
}
