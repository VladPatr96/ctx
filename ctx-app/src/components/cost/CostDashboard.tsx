import { useEffect, useState, type ReactNode } from 'react';
import { DollarSign, TrendingUp, Activity } from 'lucide-react';
import type { ApiClient } from '../../api/client';
import type { AnalyticsSummary } from '../../api/types';
import { CostChart } from './CostChart';
import { BudgetAlert } from './BudgetAlert';

interface CostDashboardProps {
  client: ApiClient;
}

export function CostDashboard({ client }: CostDashboardProps) {
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchSummary = async () => {
      try {
        setLoading(true);
        setError('');
        const next = await client.getAnalyticsSummary();
        setSummary(next);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    void fetchSummary();
    const interval = setInterval(fetchSummary, 5000);
    return () => clearInterval(interval);
  }, [client]);

  if (loading && !summary) {
    return (
      <section className="panel">
        <h3>Стоимость</h3>
        <p style={{ color: 'var(--muted)' }}>Загрузка данных о стоимости...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className="panel">
        <h3>Стоимость</h3>
        <p className="error-text">{error}</p>
      </section>
    );
  }

  const totalCost = summary?.totals.totalCost || 0;
  const totalRequests = summary?.totals.totalRequests || 0;
  const costPerRequest = summary?.totals.costPerRequest || 0;
  const providers = summary?.providers || [];
  const globalBudget = summary?.budget.global || null;
  const chartData = (summary?.timeline.points || []).map((point) => ({
    timestamp: point.bucketStart,
    cost: point.totalCost,
    requests: point.requests,
  }));

  return (
    <section className="panel">
      <h3>Стоимость API</h3>

      {globalBudget ? (
        <div style={{ marginBottom: 24 }}>
          <BudgetAlert
            currentCost={globalBudget.currentCost}
            budgetLimit={globalBudget.budget}
            warningThreshold={Math.round((summary?.budget.thresholds.warning || 0.8) * 100)}
          />
        </div>
      ) : (
        <div style={{ marginBottom: 24, fontSize: 12, color: 'var(--muted)' }}>
          Global budget is not configured yet.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <MetricCard icon={<DollarSign size={16} style={{ color: 'var(--primary)' }} />} label="Всего потрачено" value={`$${totalCost.toFixed(4)}`} />
        <MetricCard icon={<Activity size={16} style={{ color: 'var(--primary)' }} />} label="Всего запросов" value={String(totalRequests)} />
        <MetricCard icon={<TrendingUp size={16} style={{ color: 'var(--primary)' }} />} label="Стоимость запроса" value={`$${costPerRequest.toFixed(4)}`} />
        <MetricCard icon={<TrendingUp size={16} style={{ color: 'var(--primary)' }} />} label="Projected 30d" value={`$${(summary?.totals.projectedMonthlyCost || 0).toFixed(2)}`} />
      </div>

      <div style={{ marginBottom: 24 }}>
        <CostChart data={chartData} showRequests={true} />
      </div>

      {providers.length > 0 ? (
        <div>
          <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            По провайдерам
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {providers.map((provider) => (
              <div
                key={provider.provider}
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'minmax(0, 1fr) auto',
                  gap: 12,
                  padding: 12,
                  borderRadius: 6,
                  background: 'var(--surface-alt)',
                  border: '1px solid var(--border-soft)'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                    {provider.provider}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {provider.requests} requests · ${provider.avgCostPerRequest.toFixed(4)} / request
                  </div>
                  {provider.quality ? (
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                      Quality {provider.quality.score} · {provider.quality.successRate.toFixed(1)}% success · {provider.quality.avgLatencyMs.toFixed(0)}ms
                    </div>
                  ) : null}
                  {provider.budget ? (
                    <div style={{ fontSize: 11, marginTop: 4, color: provider.budget.alert ? 'var(--warning)' : 'var(--muted)' }}>
                      Budget {provider.budget.percentUsed.toFixed(1)}% of ${provider.budget.budget.toFixed(2)}
                    </div>
                  ) : null}
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary)' }}>
                    ${provider.totalCost.toFixed(4)}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    Eff. {provider.efficiencyScore ?? '—'}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p style={{ color: 'var(--muted)', fontSize: 14 }}>
          Нет данных о стоимости. Данные появятся после первого запроса к провайдеру.
        </p>
      )}

      {summary?.recommendations.length ? (
        <div style={{ marginTop: 24 }}>
          <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            Optimization recommendations
          </h4>
          <div style={{ display: 'grid', gap: 8 }}>
            {summary.recommendations.slice(0, 3).map((recommendation) => (
              <div
                key={`${recommendation.type}-${recommendation.title}`}
                style={{
                  padding: 12,
                  borderRadius: 6,
                  background: 'var(--surface-alt)',
                  border: '1px solid var(--border-soft)'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline' }}>
                  <strong style={{ fontSize: 13 }}>{recommendation.title}</strong>
                  <span style={{ fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase' }}>{recommendation.priority}</span>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                  {recommendation.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function MetricCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div
      style={{
        padding: 16,
        borderRadius: 8,
        background: 'var(--surface-alt)',
        border: '1px solid var(--border-soft)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        {icon}
        <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--muted)' }}>
          {label}
        </span>
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>
        {value}
      </div>
    </div>
  );
}
