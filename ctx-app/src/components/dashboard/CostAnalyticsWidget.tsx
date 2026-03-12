import { useEffect, useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import type { ApiClient } from '../../api/client';
import type { AnalyticsSummary } from '../../api/types';

interface CostAnalyticsWidgetProps {
  client: ApiClient;
}

const COLORS: Record<string, string> = {
  claude: 'var(--primary, #6366f1)',
  gemini: 'var(--success, #10b981)',
  opencode: 'var(--warning, #f59e0b)',
  codex: '#f87171',
};

const FALLBACK_COLORS = ['#5fa2ff', '#34d399', '#fbbf24', '#f87171', '#a78bfa'];

export function CostAnalyticsWidget({ client }: CostAnalyticsWidgetProps) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const fetchSummary = async () => {
      try {
        const next = await client.getAnalyticsSummary();
        if (!cancelled) {
          setSummary(next);
          setError('');
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    };

    void fetchSummary();
    const interval = setInterval(fetchSummary, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [client]);

  const providerKeys = useMemo(() => {
    return (summary?.providers || []).map((provider) => provider.provider);
  }, [summary]);

  const chartData = useMemo(() => {
    return (summary?.timeline.points || []).map((point) => ({
      date: point.label,
      ...point.providers,
      totalCost: point.totalCost,
    }));
  }, [summary]);

  const activeAlerts = (summary?.budget.hasAlerts ? 1 : 0) + (summary?.routing.anomalyCount || 0);

  if (error) {
    return (
      <div className="panel">
        <h3 style={{ margin: 0, fontSize: '15px' }}>Analytics Summary</h3>
        <p className="error-text">{error}</p>
      </div>
    );
  }

  return (
    <div className="panel" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, fontSize: '15px' }}>Аналитика расходов (7 дней)</h3>
        <span style={{ fontSize: '18px', fontWeight: 'bold', color: 'var(--text)' }}>
          ${(summary?.totals.totalCost || 0).toFixed(2)}
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', fontSize: '12px' }}>
        <div style={{ background: 'var(--surface-alt)', padding: '10px', borderRadius: '8px', borderLeft: `3px solid ${COLORS.claude}` }}>
          <div style={{ color: 'var(--muted)', marginBottom: '4px' }}>Projected 30d</div>
          <div style={{ fontWeight: 'bold', fontSize: '14px' }}>${(summary?.totals.projectedMonthlyCost || 0).toFixed(2)}</div>
        </div>
        <div style={{ background: 'var(--surface-alt)', padding: '10px', borderRadius: '8px', borderLeft: `3px solid ${COLORS.gemini}` }}>
          <div style={{ color: 'var(--muted)', marginBottom: '4px' }}>Recommendations</div>
          <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{summary?.recommendations.length || 0}</div>
        </div>
        <div style={{ background: 'var(--surface-alt)', padding: '10px', borderRadius: '8px', borderLeft: `3px solid ${COLORS.opencode}` }}>
          <div style={{ color: 'var(--muted)', marginBottom: '4px' }}>Active alerts</div>
          <div style={{ fontWeight: 'bold', fontSize: '14px' }}>{activeAlerts}</div>
        </div>
      </div>

      <div style={{ height: '220px', marginTop: '8px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--border-soft)" />
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} dy={10} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--muted)' }} tickFormatter={(val) => `$${val}`} />
            <Tooltip
              contentStyle={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '8px', fontSize: '12px' }}
              itemStyle={{ fontSize: '12px' }}
              formatter={(value: number | undefined) => [`$${Number(value || 0).toFixed(2)}`, '']}
            />
            <Legend />
            {providerKeys.map((provider, index) => {
              const color = COLORS[provider] || FALLBACK_COLORS[index % FALLBACK_COLORS.length];
              return (
                <Area
                  key={provider}
                  type="monotone"
                  dataKey={provider}
                  name={provider}
                  stroke={color}
                  fillOpacity={0.12}
                  fill={color}
                  strokeWidth={2}
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {summary?.gaps.length ? (
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--muted)' }}>
          {summary.gaps[0]}
        </p>
      ) : null}
    </div>
  );
}
