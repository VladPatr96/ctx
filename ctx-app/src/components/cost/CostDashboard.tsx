import { useEffect, useState } from 'react';
import { DollarSign, TrendingUp, Activity } from 'lucide-react';
import type { ApiClient } from '../../api/client';
import type { CostSummary } from '../../api/types';
import { CostChart } from './CostChart';

interface CostDashboardProps {
  client: ApiClient;
}

export function CostDashboard({ client }: CostDashboardProps) {
  const [costData, setCostData] = useState<CostSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchCostData = async () => {
      try {
        setLoading(true);
        setError('');
        const summary = await client.getCostSummary();
        setCostData(summary);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    };

    fetchCostData();

    const interval = setInterval(fetchCostData, 5000);
    return () => clearInterval(interval);
  }, [client]);

  if (loading && !costData) {
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

  const totalCost = costData?.totalCost || 0;
  const totalRequests = costData?.totalRequests || 0;
  const costPerRequest = costData?.costPerRequest || 0;
  const providers = costData?.providers || {};

  const providersList = Object.entries(providers).map(([provider, data]) => ({
    name: provider,
    cost: data.cost,
    requests: data.requests,
  }));

  return (
    <section className="panel">
      <h3>Стоимость API</h3>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
        <div style={{
          padding: 16,
          borderRadius: 8,
          background: 'var(--surface-alt)',
          border: '1px solid var(--border-soft)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <DollarSign size={16} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--muted)' }}>
              Всего потрачено
            </span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>
            ${totalCost.toFixed(4)}
          </div>
        </div>

        <div style={{
          padding: 16,
          borderRadius: 8,
          background: 'var(--surface-alt)',
          border: '1px solid var(--border-soft)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <Activity size={16} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--muted)' }}>
              Всего запросов
            </span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>
            {totalRequests}
          </div>
        </div>

        <div style={{
          padding: 16,
          borderRadius: 8,
          background: 'var(--surface-alt)',
          border: '1px solid var(--border-soft)'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <TrendingUp size={16} style={{ color: 'var(--primary)' }} />
            <span style={{ fontSize: 12, fontWeight: 600, textTransform: 'uppercase', color: 'var(--muted)' }}>
              Стоимость запроса
            </span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text)' }}>
            ${costPerRequest.toFixed(4)}
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 24 }}>
        <CostChart data={[]} showRequests={true} />
      </div>

      {providersList.length > 0 ? (
        <div>
          <h4 style={{ marginBottom: 12, fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>
            По провайдерам
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {providersList.map((provider) => (
              <div
                key={provider.name}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: 12,
                  borderRadius: 6,
                  background: 'var(--surface-alt)',
                  border: '1px solid var(--border-soft)'
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)' }}>
                    {provider.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                    {provider.requests} {provider.requests === 1 ? 'запрос' : 'запросов'}
                  </div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--primary)' }}>
                  ${provider.cost.toFixed(4)}
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
    </section>
  );
}
