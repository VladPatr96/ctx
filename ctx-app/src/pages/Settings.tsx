import { useEffect, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { KBStats, ProviderHealthEntry } from '../api/types';
import { useAppStore } from '../store/useAppStore';

interface SettingsPageProps {
  client: ApiClient;
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

export function SettingsPage({ client, onRefresh }: SettingsPageProps) {
  const state = useAppStore((s) => s.state);
  const [kbStats, setKbStats] = useState<KBStats>(EMPTY_STATS);
  const [error, setError] = useState('');

  // Webhooks mock state
  interface Webhook { id: string; url: string; event: string; }
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookEvent, setNewWebhookEvent] = useState('pipeline.done');

  // Team mock state
  interface TeamMember { id: string; email: string; role: string; }
  const [team, setTeam] = useState<TeamMember[]>([
    { id: '1', email: 'admin@ctx.local', role: 'Admin' }
  ]);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('Viewer');

  useEffect(() => {
    client.getKbStats()
      .then((stats) => {
        setKbStats(stats);
        setError('');
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [client, state?.pipeline?.updatedAt]);

  const addWebhook = () => {
    if (!newWebhookUrl) return;
    setWebhooks(prev => [...prev, { id: Date.now().toString(), url: newWebhookUrl, event: newWebhookEvent }]);
    setNewWebhookUrl('');
  };
  const removeWebhook = (id: string) => setWebhooks(prev => prev.filter(w => w.id !== id));

  const inviteMember = () => {
    if (!newMemberEmail) return;
    setTeam(prev => [...prev, { id: Date.now().toString(), email: newMemberEmail, role: newMemberRole }]);
    setNewMemberEmail('');
  };
  const removeMember = (id: string) => setTeam(prev => prev.filter(m => m.id !== id));

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
      {/* Webhooks Section */}
      <section className="panel">
        <h3>Webhooks Интеграция</h3>
        <p className="muted" style={{ fontSize: 12, margin: '0 0 16px' }}>
          Настройте внешние хуки для получения уведомлений о событиях.
        </p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <select value={newWebhookEvent} onChange={(e) => setNewWebhookEvent(e.target.value)} style={{ padding: '6px' }}>
            <option value="pipeline.done">pipeline.done</option>
            <option value="consilium.finished">consilium.finished</option>
            <option value="task.failed">task.failed</option>
          </select>
          <input
            type="url"
            placeholder="https://yourapp.com/hook"
            value={newWebhookUrl}
            onChange={(e) => setNewWebhookUrl(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="button" onClick={addWebhook}>Добавить</button>
        </div>

        {webhooks.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {webhooks.map(w => (
              <div key={w.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-alt)', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <strong>{w.event}</strong>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{w.url}</span>
                </div>
                <button type="button" onClick={() => removeWebhook(w.id)} style={{ padding: '4px 8px', fontSize: 11, border: '1px solid var(--danger)', color: 'var(--danger)', background: 'transparent' }}>Удалить</button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 12 }}>Нет настроенных webhook'ов.</p>
        )}
      </section>

      {/* Team & Access Section */}
      <section className="panel">
        <h3>Управление Командой</h3>
        <p className="muted" style={{ fontSize: 12, margin: '0 0 16px' }}>
          Пригласите коллег для совместной работы в оркестраторе.
        </p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <input
            type="email"
            placeholder="colleague@example.com"
            value={newMemberEmail}
            onChange={(e) => setNewMemberEmail(e.target.value)}
            style={{ flex: 1 }}
          />
          <select value={newMemberRole} onChange={(e) => setNewMemberRole(e.target.value)} style={{ padding: '6px' }}>
            <option value="Admin">Admin</option>
            <option value="Editor">Editor</option>
            <option value="Viewer">Viewer</option>
          </select>
          <button type="button" onClick={inviteMember}>Пригласить</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {team.map(member => (
            <div key={member.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface-alt)', padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ background: 'var(--primary)', color: 'white', width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 'bold' }}>
                  {member.email[0].toUpperCase()}
                </div>
                <span>{member.email}</span>
                <span style={{ fontSize: 11, background: 'var(--surface)', padding: '2px 6px', borderRadius: '10px', border: '1px solid var(--border)' }}>{member.role}</span>
              </div>
              {member.role !== 'Admin' && (
                <button type="button" onClick={() => removeMember(member.id)} style={{ padding: '4px 8px', fontSize: 11, border: '1px solid var(--danger)', color: 'var(--danger)', background: 'transparent' }}>Исключить</button>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Возможности провайдеров</h3>
        <div className="cap-grid">
          {Object.entries(PROVIDER_CAPABILITIES).map(([provider, caps]) => (
            <article className="cap-card" key={provider}>
              <header>
                <strong>{provider}</strong>
                <span className="muted">{models[provider] || 'модель: н/д'}</span>
              </header>
              <ul>
                {caps.map((cap) => <li key={`${provider}-${cap}`}>{cap}</li>)}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Хранилище + БЗ</h3>
        <div className="row">
          <button type="button" onClick={() => void onRefresh()}>Обновить состояние</button>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <p className="metric">Записей в БЗ: {kbStats.total}</p>
        <pre className="details-box">{JSON.stringify(storageHealth, null, 2)}</pre>
      </section>

      <section className="panel">
        <h3>Здоровье провайдеров</h3>
        {Object.keys(providerHealth).length === 0 ? (
          <p className="muted">Данных о здоровье провайдеров пока нет</p>
        ) : (
          <div className="cap-grid">
            {Object.entries(providerHealth).map(([provider, info]) => (
              <article className="cap-card" key={`health-${provider}`}>
                <header>
                  <strong>{provider}</strong>
                  <span className="muted">ошибок: {info.failures ?? 0}</span>
                </header>
                <ul>
                  <li>последний успех: {info.lastSuccess || 'н/д'}</li>
                  <li>последняя ошибка: {info.lastFailure || 'н/д'}</li>
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Телеметрия провайдеров</h3>
        {telemetryRows.length === 0 ? (
          <p className="muted">Телеметрии пока нет</p>
        ) : (
          <div className="telemetry-grid">
            {telemetryRows.map((row) => (
              <article className="telemetry-card" key={`telemetry-${row.provider}`}>
                <header>
                  <strong>{row.provider}</strong>
                  <span className="muted">
                    вызовов: {row.calls} / ошибок: {row.failuresTotal}
                  </span>
                </header>
                <div className="telemetry-row">
                  <span className="muted">успех</span>
                  <div className="telemetry-track">
                    <div className="telemetry-bar telemetry-success" style={{ width: `${row.successRate}%` }} />
                  </div>
                  <span>{row.hasTelemetry ? `${row.successRate.toFixed(1)}%` : 'н/д'}</span>
                </div>
                <div className="telemetry-row">
                  <span className="muted">задержка</span>
                  <div className="telemetry-track">
                    <div
                      className="telemetry-bar telemetry-latency"
                      style={{ width: `${clamp((row.avgLatencyMs / maxLatency) * 100, 0, 100)}%` }}
                    />
                  </div>
                  <span>{row.avgLatencyMs > 0 ? `${row.avgLatencyMs} мс` : 'н/д'}</span>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
