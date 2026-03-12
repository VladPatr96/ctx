import { useCallback, useEffect, useState } from 'react';
import { TrendingDown, Lightbulb, DollarSign } from 'lucide-react';
import type { ApiClient } from '../../api/client';
import type { CostSummary } from '../../api/types';

interface OptimizationRecommendationsProps {
  client: ApiClient;
}

interface Recommendation {
  type: 'provider_switch' | 'usage_optimization' | 'budget_alert';
  severity: 'info' | 'warning' | 'suggestion';
  title: string;
  message: string;
  potentialSavings?: number;
  provider?: string;
}

function generateRecommendations(costData: CostSummary): Recommendation[] {
  const recommendations: Recommendation[] = [];
  const { providers, totalCost, costPerRequest } = costData;

  // Sort providers by cost
  const providerEntries = Object.entries(providers).map(([name, data]) => ({
    name,
    cost: data.cost,
    requests: data.requests,
    costPerRequest: data.requests > 0 ? data.cost / data.requests : 0
  }));

  providerEntries.sort((a, b) => a.costPerRequest - b.costPerRequest);

  // If we have multiple providers, suggest cheaper alternatives
  if (providerEntries.length >= 2) {
    const cheapest = providerEntries[0];
    const mostExpensive = providerEntries[providerEntries.length - 1];

    if (mostExpensive.requests > 0 && cheapest.costPerRequest < mostExpensive.costPerRequest * 0.8) {
      const savingsPercent = ((mostExpensive.costPerRequest - cheapest.costPerRequest) / mostExpensive.costPerRequest * 100);
      const potentialSavings = (mostExpensive.costPerRequest - cheapest.costPerRequest) * mostExpensive.requests;

      recommendations.push({
        type: 'provider_switch',
        severity: 'suggestion',
        title: `Рассмотрите использование ${cheapest.name}`,
        message: `${cheapest.name} на ${savingsPercent.toFixed(0)}% дешевле чем ${mostExpensive.name} (${cheapest.costPerRequest.toFixed(4)} vs ${mostExpensive.costPerRequest.toFixed(4)} за запрос)`,
        potentialSavings,
        provider: cheapest.name
      });
    }
  }

  // Check for high cost per request
  if (costPerRequest > 0.01 && providerEntries.some(p => p.costPerRequest < costPerRequest * 0.7)) {
    recommendations.push({
      type: 'usage_optimization',
      severity: 'info',
      title: 'Оптимизируйте использование провайдеров',
      message: 'Средняя стоимость запроса выше оптимальной. Рассмотрите использование более дешевых провайдеров для простых задач.',
    });
  }

  // Budget awareness
  if (totalCost > 0.5) {
    recommendations.push({
      type: 'budget_alert',
      severity: 'warning',
      title: 'Расходы растут',
      message: `Общие расходы составляют $${totalCost.toFixed(4)}. Рассмотрите настройку бюджетных лимитов.`,
    });
  }

  // General optimization tip if we have data but no specific recommendations
  if (recommendations.length === 0 && providerEntries.length > 0) {
    const totalRequests = providerEntries.reduce((sum, p) => sum + p.requests, 0);
    if (totalRequests > 10) {
      recommendations.push({
        type: 'usage_optimization',
        severity: 'info',
        title: 'Производительность в норме',
        message: 'Ваши текущие затраты оптимальны. Продолжайте мониторить расходы через дашборд.',
      });
    }
  }

  return recommendations;
}

function RecommendationCard({ recommendation }: { recommendation: Recommendation }) {
  const getIcon = () => {
    switch (recommendation.type) {
      case 'provider_switch':
        return <TrendingDown size={20} style={{ color: '#34d399', flexShrink: 0 }} />;
      case 'usage_optimization':
        return <Lightbulb size={20} style={{ color: '#fbbf24', flexShrink: 0 }} />;
      case 'budget_alert':
        return <DollarSign size={20} style={{ color: '#f87171', flexShrink: 0 }} />;
    }
  };

  const getBorderColor = () => {
    switch (recommendation.severity) {
      case 'warning':
        return '1px solid rgba(248, 113, 113, 0.3)';
      case 'suggestion':
        return '1px solid rgba(52, 211, 153, 0.3)';
      case 'info':
      default:
        return '1px solid var(--border-soft)';
    }
  };

  const getBackgroundColor = () => {
    switch (recommendation.severity) {
      case 'warning':
        return 'rgba(248, 113, 113, 0.05)';
      case 'suggestion':
        return 'rgba(52, 211, 153, 0.05)';
      case 'info':
      default:
        return 'var(--surface-alt)';
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: 12,
        padding: 12,
        borderRadius: 8,
        background: getBackgroundColor(),
        border: getBorderColor(),
        marginBottom: 12,
      }}
    >
      {getIcon()}
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', marginBottom: 4 }}>
          {recommendation.title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>
          {recommendation.message}
        </div>
        {recommendation.potentialSavings && recommendation.potentialSavings > 0 && (
          <div style={{ fontSize: 12, color: '#34d399', marginTop: 6, fontWeight: 500 }}>
            💰 Потенциальная экономия: ${recommendation.potentialSavings.toFixed(4)}
          </div>
        )}
      </div>
    </div>
  );
}

export function OptimizationRecommendations({ client }: OptimizationRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const costData = await client.getCostSummary();
      const recs = generateRecommendations(costData);
      setRecommendations(recs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить рекомендации');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="telemetry-card" style={{ marginBottom: 16 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <strong>Рекомендации по оптимизации</strong>
        <button
          type="button"
          className="nav-btn"
          onClick={fetchData}
          disabled={loading}
          style={{ fontSize: 12, padding: '4px 12px' }}
        >
          {loading ? 'Загрузка...' : 'Обновить'}
        </button>
      </header>

      {error ? (
        <div className="error-banner" style={{ marginTop: 12 }}>
          {error}
        </div>
      ) : null}

      {!loading && !error && recommendations.length > 0 ? (
        <div style={{ marginTop: 12 }}>
          {recommendations.map((rec, i) => (
            <RecommendationCard key={i} recommendation={rec} />
          ))}
        </div>
      ) : null}

      {!loading && !error && recommendations.length === 0 ? (
        <p style={{ fontSize: 13, opacity: 0.6, marginTop: 12 }}>
          Нет рекомендаций. Данные появятся после накопления статистики использования.
        </p>
      ) : null}
    </div>
  );
}
