import type { ProviderAnalytics } from '../../api/types';

interface ProviderMetricsTableProps {
  providers: ProviderAnalytics[];
}

function formatNumber(val: number | null | undefined, decimals = 0): string {
  if (val == null) return '—';
  return decimals > 0 ? val.toFixed(decimals) : val.toString();
}

function formatPercent(val: number | null | undefined): string {
  if (val == null) return '—';
  return `${(val * 100).toFixed(1)}%`;
}

function formatCurrency(val: number | null | undefined): string {
  if (val == null) return '—';
  return `$${val.toFixed(4)}`;
}

export function ProviderMetricsTable({ providers }: ProviderMetricsTableProps) {
  if (providers.length === 0) {
    return <p style={{ fontSize: 13, opacity: 0.6 }}>Данных о производительности провайдеров пока нет.</p>;
  }

  // Sort by total responses descending (most active providers first)
  const sortedProviders = [...providers].sort((a, b) => b.total_responses - a.total_responses);

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border)' }}>
            <th style={{ padding: '6px 8px' }}>Провайдер</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Ответов</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Побед</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Процент побед</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Ср. латентность</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Ср. уверенность</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Ср. цена</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Общая цена</th>
            <th style={{ padding: '6px 8px', textAlign: 'right' }}>Ср. качество</th>
          </tr>
        </thead>
        <tbody>
          {sortedProviders.map((provider) => (
            <tr key={provider.provider} style={{ borderBottom: '1px solid var(--border)' }}>
              <td style={{ padding: '4px 8px' }}>
                <strong>{provider.provider}</strong>
              </td>
              <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                {formatNumber(provider.total_responses)}
              </td>
              <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                {formatNumber(provider.wins)}
              </td>
              <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                {typeof provider.win_rate === 'string' ? provider.win_rate : formatPercent(provider.win_rate)}
              </td>
              <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                {provider.avg_response_ms != null ? `${formatNumber(provider.avg_response_ms, 0)}ms` : '—'}
              </td>
              <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                {formatNumber(provider.avg_confidence, 3)}
              </td>
              <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                {formatCurrency(provider.avg_cost_usd)}
              </td>
              <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                {formatCurrency(provider.total_cost_usd)}
              </td>
              <td style={{ padding: '4px 8px', textAlign: 'right' }}>
                {formatNumber(provider.avg_quality_rating, 1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
