import { useEffect, useState } from 'react';
import type { ApiClient } from '../api/client';
import type {
  KBStats,
  ProviderExtensibilityInventory,
  ProviderRecoveryInventory,
  ResilienceAuditInventory,
  RuntimeFallbackInventory,
  ShellSummary,
} from '../api/types';
import { useAppStore } from '../store/useAppStore';

interface SettingsPageProps {
  client: ApiClient;
  onRefresh: () => Promise<void>;
}

interface Webhook {
  id: string;
  url: string;
  event: string;
}

interface TeamMember {
  id: string;
  email: string;
  role: string;
}

const EMPTY_STATS: KBStats = { total: 0, byCategory: {}, byProject: {} };
const EMPTY_SHELL_SUMMARY: ShellSummary = {
  session: { stage: 'idle', lead: 'codex', task: null, updatedAt: null },
  project: { name: '', branch: '', stackLabel: '' },
  storage: {
    status: 'offline',
    mode: 'unknown',
    effectiveMode: 'unknown',
    policyState: null,
    failureRatio: null,
    failover: false,
    shadow: false,
    warningActive: false,
    reasons: [],
    sourceCount: 0,
    sources: {},
    ts: null,
  },
  providers: { models: {}, cards: [] },
};
const EMPTY_PROVIDER_EXTENSIBILITY: ProviderExtensibilityInventory = {
  generatedAt: new Date(0).toISOString(),
  summary: {
    totalProviders: 0,
    builtinOnly: 0,
    configurable: 0,
    localModelCapable: 0,
  },
  providers: [],
};
const EMPTY_PROVIDER_RECOVERY: ProviderRecoveryInventory = {
  generatedAt: new Date(0).toISOString(),
  summary: {
    totalProviders: 0,
    actionableProviders: 0,
    degradedProviders: 0,
    offlineProviders: 0,
    localModelRecoveryOptions: 0,
  },
  providers: [],
};
const EMPTY_RESILIENCE_AUDIT: ResilienceAuditInventory = {
  generatedAt: new Date(0).toISOString(),
  summary: {
    totalEvents: 0,
    openIncidents: 0,
    recoveryEvents: 0,
    notifications: 0,
    throttles: 0,
    offlineProviders: 0,
    degradedProviders: 0,
    storageStatus: 'offline',
  },
  events: [],
  notifications: [],
  throttles: [],
};
const EMPTY_RUNTIME_FALLBACKS: RuntimeFallbackInventory = {
  generatedAt: new Date(0).toISOString(),
  offlineReady: false,
  summary: {
    storageOffline: true,
    fallbackCandidateCount: 0,
    localModelFallbackCount: 0,
    providerOfflineCount: 0,
  },
  storage: {
    status: 'offline',
    effectiveMode: 'unknown',
    policyState: null,
    failureRatio: null,
    reasons: [],
    fallbackMode: 'unavailable',
    availableActions: ['manual_recovery'],
  },
  providers: {
    lead: null,
    leadStatus: null,
    readyCount: 0,
    degradedCount: 0,
    offlineCount: 0,
    localModelCapableCount: 0,
    candidates: [],
  },
};
const INITIAL_TEAM: TeamMember[] = [
  { id: '1', email: 'admin@ctx.local', role: 'Admin' },
];

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const formatRuntimeStatus = (status: string) => status.replace(/_/g, ' ');
const formatBool = (value: boolean) => (value ? 'yes' : 'no');

export function SettingsPage({ client, onRefresh }: SettingsPageProps) {
  const pipelineUpdatedAt = useAppStore((s) => s.state?.pipeline?.updatedAt);
  const [kbStats, setKbStats] = useState<KBStats>(EMPTY_STATS);
  const [shellSummary, setShellSummary] = useState<ShellSummary>(EMPTY_SHELL_SUMMARY);
  const [providerExtensibility, setProviderExtensibility] = useState<ProviderExtensibilityInventory>(EMPTY_PROVIDER_EXTENSIBILITY);
  const [providerRecovery, setProviderRecovery] = useState<ProviderRecoveryInventory>(EMPTY_PROVIDER_RECOVERY);
  const [resilienceAudit, setResilienceAudit] = useState<ResilienceAuditInventory>(EMPTY_RESILIENCE_AUDIT);
  const [runtimeFallbacks, setRuntimeFallbacks] = useState<RuntimeFallbackInventory>(EMPTY_RUNTIME_FALLBACKS);
  const [error, setError] = useState('');
  const [webhooks, setWebhooks] = useState<Webhook[]>([]);
  const [newWebhookUrl, setNewWebhookUrl] = useState('');
  const [newWebhookEvent, setNewWebhookEvent] = useState('pipeline.done');
  const [team, setTeam] = useState<TeamMember[]>(INITIAL_TEAM);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('Viewer');

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      client.getKbStats(),
      client.getShellSummary(),
      client.getProviderExtensibility(),
      client.getProviderRecovery(),
      client.getRuntimeResilience(),
      client.getRuntimeFallbacks(),
    ])
      .then(([stats, summary, extensibility, recovery, resilience, fallbacks]) => {
        if (cancelled) return;
        setKbStats(stats);
        setShellSummary(summary);
        setProviderExtensibility(extensibility);
        setProviderRecovery(recovery);
        setResilienceAudit(resilience);
        setRuntimeFallbacks(fallbacks);
        setError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
    };
  }, [client, pipelineUpdatedAt]);

  const addWebhook = () => {
    if (!newWebhookUrl) return;
    setWebhooks((prev) => [...prev, {
      id: Date.now().toString(),
      url: newWebhookUrl,
      event: newWebhookEvent,
    }]);
    setNewWebhookUrl('');
  };

  const removeWebhook = (id: string) => {
    setWebhooks((prev) => prev.filter((webhook) => webhook.id !== id));
  };

  const inviteMember = () => {
    if (!newMemberEmail) return;
    setTeam((prev) => [...prev, {
      id: Date.now().toString(),
      email: newMemberEmail,
      role: newMemberRole,
    }]);
    setNewMemberEmail('');
  };

  const removeMember = (id: string) => {
    setTeam((prev) => prev.filter((member) => member.id !== id));
  };

  const models = shellSummary.providers.models;
  const providerCards = shellSummary.providers.cards;
  const telemetryRows = providerCards.map((card) => ({
    provider: card.provider,
    calls: Number(card.calls || 0),
    failuresTotal: Number(card.failures || 0),
    successRate: clamp(Number(card.successRate || 0), 0, 100),
    avgLatencyMs: Number(card.avgLatencyMs || 0),
    hasTelemetry: Boolean(card.hasTelemetry),
  }));
  const maxLatency = telemetryRows.reduce((max, row) => Math.max(max, row.avgLatencyMs), 0) || 1;

  return (
    <div className="page-grid">
      <section className="panel">
        <h3>Webhooks</h3>
        <p className="muted" style={{ fontSize: 12, margin: '0 0 16px' }}>
          Configure outbound hooks for pipeline and consilium events.
        </p>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
          <select value={newWebhookEvent} onChange={(e) => setNewWebhookEvent(e.target.value)} style={{ padding: '6px' }}>
            <option value="pipeline.done">pipeline.done</option>
            <option value="consilium.finished">consilium.finished</option>
            <option value="task.failed">task.failed</option>
          </select>
          <input
            type="url"
            placeholder="https://example.com/hook"
            value={newWebhookUrl}
            onChange={(e) => setNewWebhookUrl(e.target.value)}
            style={{ flex: 1 }}
          />
          <button type="button" onClick={addWebhook}>Add</button>
        </div>

        {webhooks.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {webhooks.map((webhook) => (
              <div
                key={webhook.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  background: 'var(--surface-alt)',
                  padding: '8px 12px',
                  borderRadius: '4px',
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <strong>{webhook.event}</strong>
                  <span style={{ fontSize: 12, color: 'var(--muted)' }}>{webhook.url}</span>
                </div>
                <button
                  type="button"
                  onClick={() => removeWebhook(webhook.id)}
                  style={{ padding: '4px 8px', fontSize: 11, border: '1px solid var(--danger)', color: 'var(--danger)', background: 'transparent' }}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 12 }}>No webhooks configured.</p>
        )}
      </section>

      <section className="panel">
        <h3>Team access</h3>
        <p className="muted" style={{ fontSize: 12, margin: '0 0 16px' }}>
          Manage collaborators for the operator surface.
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
          <button type="button" onClick={inviteMember}>Invite</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {team.map((member) => (
            <div
              key={member.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                background: 'var(--surface-alt)',
                padding: '8px 12px',
                borderRadius: '4px',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    background: 'var(--primary)',
                    color: 'white',
                    width: 24,
                    height: 24,
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 12,
                    fontWeight: 'bold',
                  }}
                >
                  {member.email[0].toUpperCase()}
                </div>
                <span>{member.email}</span>
                <span style={{ fontSize: 11, background: 'var(--surface)', padding: '2px 6px', borderRadius: '10px', border: '1px solid var(--border)' }}>
                  {member.role}
                </span>
              </div>
              {member.role !== 'Admin' ? (
                <button
                  type="button"
                  onClick={() => removeMember(member.id)}
                  style={{ padding: '4px 8px', fontSize: 11, border: '1px solid var(--danger)', color: 'var(--danger)', background: 'transparent' }}
                >
                  Remove
                </button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h3>Provider extensibility</h3>
        <p className="metric">Total providers: {providerExtensibility.summary.totalProviders}</p>
        <p className="metric">Local-model capable: {providerExtensibility.summary.localModelCapable}</p>
        <p className="metric">Configurable providers: {providerExtensibility.summary.configurable}</p>

        {providerExtensibility.providers.length === 0 ? (
          <p className="muted" style={{ fontSize: 12 }}>No provider extensibility inventory available.</p>
        ) : (
          <div className="cap-grid">
            {providerExtensibility.providers.map((provider) => (
              <article className="cap-card" key={provider.provider}>
                <header>
                  <strong>{provider.provider}</strong>
                  <span className="muted">{models[provider.provider] || provider.defaultModel || 'model: n/a'}</span>
                </header>
                <ul>
                  <li>Extensibility: {formatRuntimeStatus(provider.extensibility)}</li>
                  <li>Plugin surface: {formatRuntimeStatus(provider.pluginSurface)}</li>
                  <li>Model source: {formatRuntimeStatus(provider.modelSource)}</li>
                  <li>Runtime: {provider.mode} / {provider.adapter}</li>
                  <li>Transport: {provider.transport || 'n/a'} / {provider.executionTransport}</li>
                  <li>Catalog: {provider.modelCount} models</li>
                  <li>Custom models: {formatBool(provider.supportsCustomModels)}</li>
                  <li>Local models: {formatBool(provider.supportsLocalModels)}</li>
                  {provider.discoveryInputs.length ? (
                    <li>Discovery: {provider.discoveryInputs.map((input) => input.value).join(', ')}</li>
                  ) : null}
                  {provider.localModelHints.length ? (
                    <li>{provider.localModelHints[0]}</li>
                  ) : null}
                </ul>
                {provider.capabilities.length ? (
                  <p className="muted" style={{ fontSize: 12, margin: '12px 0 0' }}>
                    Capabilities: {provider.capabilities.join(', ')}
                  </p>
                ) : null}
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Provider recovery hooks</h3>
        <p className="metric">Actionable providers: {providerRecovery.summary.actionableProviders}</p>
        <p className="metric">Degraded providers: {providerRecovery.summary.degradedProviders}</p>
        <p className="metric">Offline providers: {providerRecovery.summary.offlineProviders}</p>
        <p className="metric">Local-model recovery options: {providerRecovery.summary.localModelRecoveryOptions}</p>

        {providerRecovery.providers.length === 0 ? (
          <p className="muted" style={{ fontSize: 12 }}>No provider recovery inventory available.</p>
        ) : (
          <div className="cap-grid">
            {providerRecovery.providers.map((provider) => (
              <article className="cap-card" key={`recovery-${provider.provider}`}>
                <header>
                  <strong>{provider.provider}</strong>
                  <span className="muted">
                    {formatRuntimeStatus(provider.outageLevel)} / {formatRuntimeStatus(provider.status)}
                  </span>
                </header>
                <ul>
                  <li>Recommended action: {formatRuntimeStatus(provider.recommendedAction)}</li>
                  <li>Fallback provider: {provider.fallbackProvider || 'n/a'}</li>
                  <li>Fallback role: {provider.fallbackRole ? formatRuntimeStatus(provider.fallbackRole) : 'n/a'}</li>
                  <li>Current model: {provider.currentModel || 'n/a'}</li>
                  <li>Default model: {provider.defaultModel || 'n/a'}</li>
                  <li>Transport: {provider.adapter} / {provider.executionTransport}</li>
                  <li>Timeout action: {formatRuntimeStatus(provider.hooks.timeoutAction)}</li>
                  <li>Cleanup scope: {provider.hooks.cleanupScope}</li>
                  <li>Checkpointing: {formatBool(provider.hooks.supportsCheckpointing)}</li>
                  <li>Suspend: {formatBool(provider.hooks.supportsSuspend)}</li>
                  <li>Lifecycle hooks: {provider.hooks.lifecycleHooks.join(', ')}</li>
                  <li>Available actions: {provider.availableActions.map((action) => formatRuntimeStatus(action)).join(', ')}</li>
                  <li>Reasons: {provider.reasons.join(', ')}</li>
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Resilience audit</h3>
        <p className="metric">Open incidents: {resilienceAudit.summary.openIncidents}</p>
        <p className="metric">Recovery events: {resilienceAudit.summary.recoveryEvents}</p>
        <p className="metric">Notifications: {resilienceAudit.summary.notifications}</p>
        <p className="metric">Throttle hooks: {resilienceAudit.summary.throttles}</p>
        <p className="metric">Storage status: {formatRuntimeStatus(resilienceAudit.summary.storageStatus)}</p>

        {resilienceAudit.notifications.length > 0 ? (
          <div className="cap-grid" style={{ marginBottom: 16 }}>
            {resilienceAudit.notifications.map((notification) => (
              <article className="cap-card" key={notification.id}>
                <header>
                  <strong>{notification.title}</strong>
                  <span className="muted">{formatRuntimeStatus(notification.kind)}</span>
                </header>
                <ul>
                  <li>Severity: {formatRuntimeStatus(notification.severity)}</li>
                  <li>Target: {notification.target}</li>
                  <li>Message: {notification.message}</li>
                  <li>Suggested action: {notification.suggestedAction ? formatRuntimeStatus(notification.suggestedAction) : 'n/a'}</li>
                  <li>Throttle mode: {notification.throttleMode ? formatRuntimeStatus(notification.throttleMode) : 'n/a'}</li>
                </ul>
              </article>
            ))}
          </div>
        ) : (
          <p className="muted" style={{ fontSize: 12 }}>No resilience notifications active.</p>
        )}

        {resilienceAudit.throttles.length > 0 ? (
          <div className="cap-grid" style={{ marginBottom: 16 }}>
            {resilienceAudit.throttles.map((throttle) => (
              <article className="cap-card" key={throttle.id}>
                <header>
                  <strong>{throttle.target}</strong>
                  <span className="muted">{formatRuntimeStatus(throttle.mode)}</span>
                </header>
                <ul>
                  <li>Reason: {throttle.reason}</li>
                  <li>Action: {throttle.action ? formatRuntimeStatus(throttle.action) : 'n/a'}</li>
                </ul>
              </article>
            ))}
          </div>
        ) : null}

        {resilienceAudit.events.length === 0 ? (
          <p className="muted" style={{ fontSize: 12 }}>No resilience audit events recorded.</p>
        ) : (
          <div className="cap-grid">
            {resilienceAudit.events.map((event) => (
              <article className="cap-card" key={event.id}>
                <header>
                  <strong>{event.target}</strong>
                  <span className="muted">
                    {formatRuntimeStatus(event.transition)} / {formatRuntimeStatus(event.severity)}
                  </span>
                </header>
                <ul>
                  <li>Status: {formatRuntimeStatus(event.status)}</li>
                  <li>Recorded at: {event.recordedAt}</li>
                  <li>Action: {event.recommendedAction ? formatRuntimeStatus(event.recommendedAction) : 'n/a'}</li>
                  <li>Reasons: {event.reasons.join(', ')}</li>
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Offline fallback plan</h3>
        <p className="metric">Offline ready: {formatBool(runtimeFallbacks.offlineReady)}</p>
        <p className="metric">Storage fallback: {formatRuntimeStatus(runtimeFallbacks.storage.fallbackMode)}</p>
        <p className="metric">Lead: {runtimeFallbacks.providers.lead || 'n/a'}</p>
        <p className="metric">
          Lead status: {runtimeFallbacks.providers.leadStatus ? formatRuntimeStatus(runtimeFallbacks.providers.leadStatus) : 'n/a'}
        </p>
        <p className="metric">Fallback candidates: {runtimeFallbacks.summary.fallbackCandidateCount}</p>
        <p className="metric">Local-model fallbacks: {runtimeFallbacks.summary.localModelFallbackCount}</p>
        <p className="metric">
          Storage actions: {runtimeFallbacks.storage.availableActions.map((action) => formatRuntimeStatus(action)).join(', ')}
        </p>
        {runtimeFallbacks.storage.reasons.length ? (
          <p className="metric">Storage reasons: {runtimeFallbacks.storage.reasons.join(', ')}</p>
        ) : null}

        {runtimeFallbacks.providers.candidates.length === 0 ? (
          <p className="muted" style={{ fontSize: 12 }}>No runtime fallback candidates available.</p>
        ) : (
          <div className="cap-grid">
            {runtimeFallbacks.providers.candidates.map((candidate) => (
              <article className="cap-card" key={`fallback-${candidate.provider}`}>
                <header>
                  <strong>{candidate.provider}</strong>
                  <span className="muted">{formatRuntimeStatus(candidate.role)}</span>
                </header>
                <ul>
                  <li>Status: {formatRuntimeStatus(candidate.status)}</li>
                  <li>Current model: {candidate.currentModel || 'n/a'}</li>
                  <li>Default model: {candidate.defaultModel || 'n/a'}</li>
                  <li>Custom models: {formatBool(candidate.supportsCustomModels)}</li>
                  <li>Local models: {formatBool(candidate.supportsLocalModels)}</li>
                  <li>Reasons: {candidate.reasons.join(', ')}</li>
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Analytics + KB</h3>
        <div className="row">
          <button type="button" onClick={() => void onRefresh()}>Refresh runtime snapshot</button>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <p className="metric">KB entries: {kbStats.total}</p>
        <p className="metric">Storage status: {formatRuntimeStatus(shellSummary.storage.status)}</p>
        <p className="metric">Effective mode: {shellSummary.storage.effectiveMode}</p>
        <p className="metric">Failover policy: {shellSummary.storage.policyState || 'n/a'}</p>
        <p className="metric">
          Failure ratio: {shellSummary.storage.failureRatio === null ? 'n/a' : `${(shellSummary.storage.failureRatio * 100).toFixed(1)}%`}
        </p>
        {shellSummary.storage.reasons.length ? (
          <p className="metric">Reasons: {shellSummary.storage.reasons.join(', ')}</p>
        ) : null}
        <pre className="details-box">{JSON.stringify(shellSummary.storage, null, 2)}</pre>
      </section>

      <section className="panel">
        <h3>Provider health</h3>
        {providerCards.length === 0 ? (
          <p className="muted">No provider health data available.</p>
        ) : (
          <div className="cap-grid">
            {providerCards.map((card) => (
              <article className="cap-card" key={`health-${card.provider}`}>
                <header>
                  <strong>{card.provider}</strong>
                  <span className="muted">Status: {formatRuntimeStatus(card.status)}</span>
                  <span className="muted">Failures: {card.failures}</span>
                </header>
                <ul>
                  <li>Circuit open: {formatBool(card.circuitOpen)}</li>
                  <li>Consecutive failures: {card.consecutiveFailures}</li>
                  {card.reasons.length ? <li>Reasons: {card.reasons.join(', ')}</li> : null}
                  <li>Last success: {card.lastSuccess || 'n/a'}</li>
                  <li>Last failure: {card.lastFailure || 'n/a'}</li>
                </ul>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <h3>Provider telemetry</h3>
        {telemetryRows.length === 0 ? (
          <p className="muted">No provider telemetry available.</p>
        ) : (
          <div className="telemetry-grid">
            {telemetryRows.map((row) => (
              <article className="telemetry-card" key={`telemetry-${row.provider}`}>
                <header>
                  <strong>{row.provider}</strong>
                  <span className="muted">
                    Calls: {row.calls} / Failures: {row.failuresTotal}
                  </span>
                </header>
                <div className="telemetry-row">
                  <span className="muted">Success</span>
                  <div className="telemetry-track">
                    <div className="telemetry-bar telemetry-success" style={{ width: `${row.successRate}%` }} />
                  </div>
                  <span>{row.hasTelemetry ? `${row.successRate.toFixed(1)}%` : 'n/a'}</span>
                </div>
                <div className="telemetry-row">
                  <span className="muted">Latency</span>
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
