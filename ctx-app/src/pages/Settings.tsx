import { useEffect, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { AppState, KBStats, ProviderHealthEntry } from '../api/types';

interface SettingsPageProps {
  client: ApiClient;
  state: AppState | null;
  onRefresh: () => Promise<void>;
}

const PROVIDER_CAPABILITIES: Record<string, string[]> = {
  claude: ['planning', 'coding', 'review', 'tool_use', 'long_context'],
  gemini: ['long_context', 'coding', 'review'],
  codex: ['coding', 'review'],
  opencode: ['coding', 'tool_use', 'multi_model']
};

const EMPTY_STATS: KBStats = { total: 0, byCategory: {}, byProject: {} };
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function SettingsPage({ client, state, onRefresh }: SettingsPageProps) {
  const [kbStats, setKbStats] = useState<KBStats>(EMPTY_STATS);
  const [error, setError] = useState('');

  useEffect(() => {
    client.getKbStats()
      .then((stats) => {
        setKbStats(stats);
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [client, state?.pipeline?.updatedAt]);

  const models = ((state?.pipeline as Record<string, unknown> | null)?.models as Record<string, string> | undefined) || {};
  const storageHealth = state?.storageHealth || {};
  const providerHealth = (state?.providerHealth || {}) as Record<string, ProviderHealthEntry>;
  const telemetryRows = Object.entries(providerHealth).map(([provider, info]) => {
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
      failuresTotal,
      successRate: clamp(successRate, 0, 100),
      avgLatencyMs: avgLatencyMs > 0 ? avgLatencyMs : 0,
      hasTelemetry: calls > 0 || successes > 0 || failuresTotal > 0 || avgLatencyMs > 0
    };
  });
  const maxLatency = telemetryRows.reduce((max, row) => Math.max(max, row.avgLatencyMs), 0) || 1;

  return (
    <div className="page-grid">
      <section className="panel">
        <h3>Provider Capabilities</h3>
        <div className="cap-grid">
          {Object.entries(PROVIDER_CAPABILITIES).map(([provider, caps]) => (
            <article className="cap-card" key={provider}>
              <header>
                <strong>{provider}</strong>
                <span className="muted">{models[provider] || 'model: n/a'}</span>
              </header>
              <ul>
                {caps.map((cap) => <li key={`${provider}-${cap}`}>{cap}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Storage + KB</h3>
        <div className="row">
          <button type="button" onClick={() => void onRefresh()}>Refresh state</button>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <p className="metric">KB total: {kbStats.total}</p>
        <pre className="details-box">{JSON.stringify(storageHealth, null, 2)}</pre>
      </section>

      <section className="panel">
        <h3>Provider Health</h3>
        {Object.keys(providerHealth).length === 0 ? (
          <p className="muted">No provider-health snapshot yet</p>
        ) : (
          <div className="cap-grid">
            {Object.entries(providerHealth).map(([provider, info]) => (
              <article className="cap-card" key={`health-${provider}`}>
                <header>
                  <strong>{provider}</strong>
                  <span className="muted">failures: {info.failures ?? 0}</span>
                </header>
                <ul>
                  <li>last success: {info.lastSuccess || 'n/a'}</li>
                  <li>last failure: {info.lastFailure || 'n/a'}</li>
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Provider Telemetry</h3>
        {telemetryRows.length === 0 ? (
          <p className="muted">No telemetry yet</p>
        ) : (
          <div className="telemetry-grid">
            {telemetryRows.map((row) => (
              <article className="telemetry-card" key={`telemetry-${row.provider}`}>
                <header>
                  <strong>{row.provider}</strong>
                  <span className="muted">
                    calls: {row.calls} / failures: {row.failuresTotal}
                  </span>
                </header>
                <div className="telemetry-row">
                  <span className="muted">success</span>
                  <div className="telemetry-track">
                    <div className="telemetry-bar telemetry-success" style={{ width: `${row.successRate}%` }} />
                  </div>
                  <span>{row.hasTelemetry ? `${row.successRate.toFixed(1)}%` : 'n/a'}</span>
                </div>
                <div className="telemetry-row">
                  <span className="muted">latency</span>
                  <div className="telemetry-track">
                    <div
                      className="telemetry-bar telemetry-latency"
                      style={{ width: `${clamp((row.avgLatencyMs / maxLatency) * 100, 0, 100)}%` }}
                    />
                  </div>
                  <span>{row.avgLatencyMs > 0 ? `${row.avgLatencyMs} ms` : 'n/a'}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
