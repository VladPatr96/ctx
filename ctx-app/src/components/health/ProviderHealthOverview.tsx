import type { ProviderHealthEntry } from '../../api/types';

interface ProviderHealthOverviewProps {
  providerHealth: Record<string, ProviderHealthEntry>;
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

function formatTimestamp(timestamp?: string): string {
  if (!timestamp) return 'н/д';
  try {
    const date = new Date(timestamp);
    return date.toLocaleString('ru-RU', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
  } catch {
    return timestamp;
  }
}

function getHealthColor(successRate: number): string {
  if (successRate >= 90) return '#16a34a';
  if (successRate >= 70) return '#eab308';
  return '#dc2626';
}

export function ProviderHealthOverview({ providerHealth }: ProviderHealthOverviewProps) {
  const providers = Object.entries(providerHealth);

  if (providers.length === 0) {
    return (
      <div className="panel">
        <p style={{ opacity: 0.6, fontSize: 13 }}>
          Данных о здоровье провайдеров пока нет.
        </p>
      </div>
    );
  }

  const healthData = providers.map(([provider, info]) => {
    const calls = Number(info.calls || 0);
    const successes = Number(info.successes || 0);
    const failuresTotal = Number(info.totalFailures ?? info.failures ?? 0);
    const successRate = Number.isFinite(Number(info.successRate))
      ? Number(info.successRate)
      : (calls > 0 ? (successes / calls) * 100 : 0);
    const avgLatencyMs = Number(info.avgLatencyMs || info.lastLatencyMs || 0);

    return {
      provider,
      calls,
      successes,
      failuresTotal,
      successRate: clamp(successRate, 0, 100),
      avgLatencyMs: avgLatencyMs > 0 ? avgLatencyMs : 0,
      lastSuccess: info.lastSuccess,
      lastFailure: info.lastFailure,
      updatedAt: info.updatedAt,
      hasTelemetry: calls > 0 || successes > 0 || failuresTotal > 0 || avgLatencyMs > 0
    };
  });

  const maxLatency = healthData.reduce((max, item) => Math.max(max, item.avgLatencyMs), 0) || 1;

  return (
    <div className="telemetry-grid">
      {healthData.map((data) => {
        const healthColor = getHealthColor(data.successRate);

        return (
          <article
            key={`health-${data.provider}`}
            className="telemetry-card"
            style={{ display: 'grid', gap: 12 }}
          >
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <strong>{data.provider}</strong>
              <div
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: data.hasTelemetry ? healthColor : 'var(--muted)',
                  opacity: 0.8
                }}
                title={data.hasTelemetry ? `${data.successRate.toFixed(1)}% успешных запросов` : 'Нет данных'}
              />
            </header>

            <div style={{ display: 'grid', gap: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span className="muted">Вызовов:</span>
                <strong>{data.calls}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span className="muted">Успешных:</span>
                <strong style={{ color: '#16a34a' }}>{data.successes}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <span className="muted">Ошибок:</span>
                <strong style={{ color: data.failuresTotal > 0 ? '#dc2626' : 'inherit' }}>
                  {data.failuresTotal}
                </strong>
              </div>
            </div>

            <div style={{ display: 'grid', gap: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span className="muted" style={{ minWidth: 60 }}>Успех:</span>
                <div
                  style={{
                    flex: 1,
                    height: 8,
                    background: 'var(--surface-alt, #e2e8f0)',
                    borderRadius: 999,
                    overflow: 'hidden'
                  }}
                  title={`${data.successRate.toFixed(1)}%`}
                >
                  <div
                    style={{
                      width: `${data.successRate}%`,
                      height: '100%',
                      background: `linear-gradient(90deg, ${healthColor}, ${healthColor}cc)`,
                      transition: 'width 0.2s ease'
                    }}
                  />
                </div>
                <span style={{ minWidth: 45, textAlign: 'right' }}>
                  {data.hasTelemetry ? `${data.successRate.toFixed(1)}%` : 'н/д'}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
                <span className="muted" style={{ minWidth: 60 }}>Задержка:</span>
                <div
                  style={{
                    flex: 1,
                    height: 8,
                    background: 'var(--surface-alt, #e2e8f0)',
                    borderRadius: 999,
                    overflow: 'hidden'
                  }}
                  title={`${data.avgLatencyMs} мс`}
                >
                  <div
                    style={{
                      width: `${clamp((data.avgLatencyMs / maxLatency) * 100, 0, 100)}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #5fa2ff, #5fa2ffcc)',
                      transition: 'width 0.2s ease'
                    }}
                  />
                </div>
                <span style={{ minWidth: 45, textAlign: 'right' }}>
                  {data.avgLatencyMs > 0 ? `${Math.round(data.avgLatencyMs)} мс` : 'н/д'}
                </span>
              </div>
            </div>

            <div
              style={{
                borderTop: '1px solid var(--border)',
                paddingTop: 10,
                display: 'grid',
                gap: 4,
                fontSize: 11
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Последний успех:</span>
                <span title={data.lastSuccess}>{formatTimestamp(data.lastSuccess)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span className="muted">Последняя ошибка:</span>
                <span
                  style={{ color: data.lastFailure ? '#dc2626' : 'inherit' }}
                  title={data.lastFailure}
                >
                  {formatTimestamp(data.lastFailure)}
                </span>
              </div>
              {data.updatedAt ? (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span className="muted">Обновлено:</span>
                  <span>{formatTimestamp(data.updatedAt)}</span>
                </div>
              ) : null}
            </div>
          </article>
        );
      })}
    </div>
  );
}
