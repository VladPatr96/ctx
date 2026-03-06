import { useState, useCallback, useEffect } from 'react';
import type { ApiClient, TerminalSession } from '../api/client';
import { TeamBuilder, type TeamMember } from '../components/orchestrator/TeamBuilder';
import { TerminalPanel } from '../components/orchestrator/TerminalPanel';

interface OrchestratorPageProps {
  client: ApiClient;
}

const PROVIDERS = ['claude', 'gemini', 'codex', 'opencode'] as const;

const PROVIDER_MODELS: Record<string, string[]> = {
  claude: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'],
  gemini: ['gemini-2.0-flash', 'gemini-2.5-pro'],
  codex: ['o3', 'o4-mini'],
  opencode: ['claude-sonnet-4-6', 'gpt-4o']
};

const INTERNAL_AGENTS = [
  { id: 'architect', label: 'Architect' },
  { id: 'researcher', label: 'Researcher' },
  { id: 'implementer', label: 'Implementer' },
  { id: 'reviewer', label: 'Reviewer' },
  { id: 'tester', label: 'Tester' },
];

export function OrchestratorPage({ client }: OrchestratorPageProps) {
  // Lead task config
  const [task, setTask] = useState('');
  const [leadProvider, setLeadProvider] = useState<string>('claude');
  const [leadModel, setLeadModel] = useState<string>('claude-opus-4-6');
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);

  // Team (consilium members)
  const [members, setMembers] = useState<TeamMember[]>([]);

  // Active terminal sessions
  const [sessions, setSessions] = useState<TerminalSession[]>([]);

  // UI state
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  // Update lead model when provider changes
  const onLeadProviderChange = (p: string) => {
    setLeadProvider(p);
    setLeadModel(PROVIDER_MODELS[p]?.[0] || '');
  };

  const toggleAgent = (id: string) => {
    setSelectedAgents((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id]
    );
  };

  // Fetch existing sessions on mount
  useEffect(() => {
    client.listTerminalSessions().then(setSessions).catch(() => { });
  }, [client]);

  const launch = useCallback(async () => {
    if (!task.trim()) {
      setError('Задача обязательна');
      return;
    }
    setBusy(true);
    setError('');

    try {
      const newSessions: TerminalSession[] = [];

      // Spawn lead session
      const leadId = await client.createTerminalSession({
        provider: leadProvider,
        model: leadModel,
        task: task.trim(),
        label: `Lead: ${leadProvider}/${leadModel}`,
        branch: ''
      });
      newSessions.push({
        id: leadId,
        provider: leadProvider,
        model: leadModel,
        label: `Lead: ${leadProvider}/${leadModel}`,
        branch: '',
        status: 'starting',
        startedAt: Date.now(),
        ringSize: 0
      });

      // Spawn consilium members
      for (const member of members) {
        const sid = await client.createTerminalSession({
          provider: member.provider,
          model: member.model,
          task: task.trim(),
          label: `${member.role}: ${member.provider}/${member.model}`,
          branch: ''
        });
        newSessions.push({
          id: sid,
          provider: member.provider,
          model: member.model,
          label: `${member.role}: ${member.provider}/${member.model}`,
          branch: '',
          status: 'starting',
          startedAt: Date.now(),
          ringSize: 0
        });
      }

      setSessions((prev) => [...prev, ...newSessions]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [task, leadProvider, leadModel, members, client]);

  const handleKill = useCallback(async (sessionId: string) => {
    try {
      await client.killTerminalSession(sessionId);
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: 'done' } : s))
      );
    } catch (err) {
      console.error('Kill failed:', err);
    }
  }, [client]);

  const handleDelete = useCallback(async (sessionId: string) => {
    try {
      await client.deleteTerminalSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    } catch (err) {
      console.error('Delete failed:', err);
    }
  }, [client]);

  const clearDone = async () => {
    const done = sessions.filter((s) => s.status === 'done' || s.status === 'error');
    for (const s of done) {
      try { await client.deleteTerminalSession(s.id); } catch { /* ignore */ }
    }
    setSessions((prev) => prev.filter((s) => s.status !== 'done' && s.status !== 'error'));
  };

  const leadModels = PROVIDER_MODELS[leadProvider] || [];
  const runningSessions = sessions.filter((s) => s.status === 'running' || s.status === 'starting');
  const doneSessions = sessions.filter((s) => s.status === 'done' || s.status === 'error');

  const [wizardMode, setWizardMode] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);

  interface SavedConfig {
    id: string;
    name: string;
    task: string;
    leadProvider: string;
    leadModel: string;
    members: TeamMember[];
  }
  const [savedConfigs, setSavedConfigs] = useState<SavedConfig[]>([]);
  const [selectedConfigId, setSelectedConfigId] = useState<string>('');

  const handleSaveConfig = () => {
    const name = window.prompt('Введите имя для этой конфигурации:');
    if (!name) return;
    const newConfig: SavedConfig = {
      id: Date.now().toString(),
      name,
      task,
      leadProvider,
      leadModel,
      members: [...members],
    };
    setSavedConfigs(prev => [...prev, newConfig]);
    setSelectedConfigId(newConfig.id);
  };

  const handleLoadConfig = (id: string) => {
    setSelectedConfigId(id);
    if (!id) return;
    const config = savedConfigs.find(c => c.id === id);
    if (config) {
      setTask(config.task);
      setLeadProvider(config.leadProvider);
      setLeadModel(config.leadModel);
      setMembers([...config.members]);
      setWizardMode(false);
    }
  };

  return (
    <div className="page-grid">
      {/* Config panel */}
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <h3 style={{ margin: 0 }}>Orchestrator</h3>
          <button
            type="button"
            onClick={() => { setWizardMode(!wizardMode); setWizardStep(1); }}
            style={{ background: 'transparent', color: wizardMode ? 'var(--primary)' : 'var(--muted)', fontSize: 12, border: '1px solid var(--border)', padding: '4px 8px' }}
          >
            {wizardMode ? '✓ Мастер быстрой настройки' : 'Мастер быстрой настройки'}
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: '0 0 16px' }}>
          Запуск мульти-провайдерных сессий консилиума с live-выводом в терминалах
        </p>

        {/* Saved configs library */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px', padding: '12px', background: 'var(--surface-alt)', borderRadius: '8px', border: '1px solid var(--border)' }}>
          <label style={{ fontSize: 13, fontWeight: 600 }}>Пресеты:</label>
          <select
            value={selectedConfigId}
            onChange={(e) => handleLoadConfig(e.target.value)}
            style={{ flex: 1, padding: '4px 8px', fontSize: 13 }}
          >
            <option value="">-- Выберите сохранённую конфигурацию --</option>
            {savedConfigs.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button type="button" onClick={handleSaveConfig} style={{ fontSize: 12, padding: '6px 12px', background: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)', whiteSpace: 'nowrap' }}>
            Сохранить текущую
          </button>
        </div>

        {wizardMode ? (
          <div style={{ background: 'var(--surface-alt)', padding: '16px', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '16px' }}>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
              {[1, 2, 3].map(step => (
                <div key={step} style={{ flex: 1, height: '4px', background: wizardStep >= step ? 'var(--primary)' : 'var(--border)', borderRadius: '2px', transition: 'background 0.3s ease' }} />
              ))}
            </div>

            {wizardStep === 1 && (
              <div>
                <h4 style={{ margin: '0 0 12px 0' }}>Шаг 1: Какова задача?</h4>
                <textarea
                  className="orch-task-input"
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder="Подробно опишите задачу, которую нужно решить..."
                  rows={4}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '12px' }}>
                  <button type="button" onClick={() => setWizardStep(2)} disabled={!task.trim()} style={{ background: 'var(--primary)', color: 'white' }}>Далее →</button>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div>
                <h4 style={{ margin: '0 0 12px 0' }}>Шаг 2: Кто главный (Lead Provider)?</h4>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Этот агент будет получать результаты от всех остальных и принимать итоговое решение.</p>
                <div className="row" style={{ marginBottom: '16px' }}>
                  <select value={leadProvider} onChange={(e) => onLeadProviderChange(e.target.value)} style={{ padding: '8px', flex: 1 }}>
                    {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <select value={leadModel} onChange={(e) => setLeadModel(e.target.value)} style={{ padding: '8px', flex: 1 }}>
                    {leadModels.map((m) => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
                  <button type="button" onClick={() => setWizardStep(1)} style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>← Назад</button>
                  <button type="button" onClick={() => setWizardStep(3)} style={{ background: 'var(--primary)', color: 'white' }}>Далее →</button>
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div>
                <h4 style={{ margin: '0 0 12px 0' }}>Шаг 3: Сформируйте команду консилиума</h4>
                <p style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 12 }}>Выберите ассистентов, которые будут помогать главному агенту с разных точек зрения.</p>
                <TeamBuilder members={members} onChange={setMembers} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '16px' }}>
                  <button type="button" onClick={() => setWizardStep(2)} style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>← Назад</button>
                  <button type="button" onClick={launch} disabled={busy} className="dp-launch-btn">
                    {busy ? 'Запуск...' : '🚀 Начать Оркестрацию'}
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Task input */}
            <div style={{ marginBottom: 10 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
                Задача
              </label>
              <textarea
                className="orch-task-input"
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder="Опишите задачу для всех агентов..."
                rows={3}
              />
            </div>

            {/* Lead provider */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 4 }}>
                Ведущий провайдер
              </label>
              <div className="row">
                <select
                  value={leadProvider}
                  onChange={(e) => onLeadProviderChange(e.target.value)}
                >
                  {PROVIDERS.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
                <select
                  value={leadModel}
                  onChange={(e) => setLeadModel(e.target.value)}
                >
                  {leadModels.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Internal agents */}
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 6 }}>
                Внутренние агенты
              </label>
              <div className="orch-agents-grid">
                {INTERNAL_AGENTS.map((agent) => {
                  const active = selectedAgents.includes(agent.id);
                  return (
                    <button
                      key={agent.id}
                      type="button"
                      className={`orch-agent-chip ${active ? 'active' : ''}`}
                      onClick={() => toggleAgent(agent.id)}
                    >
                      {agent.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Team builder */}
            <div style={{ marginBottom: 12 }}>
              <TeamBuilder members={members} onChange={setMembers} />
            </div>

            {/* Launch */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                type="button"
                className="dp-launch-btn"
                onClick={launch}
                disabled={busy || !task.trim()}
              >
                {busy ? 'Запуск...' : 'Запустить оркестрацию'}
              </button>

              {doneSessions.length > 0 ? (
                <button
                  type="button"
                  style={{ fontSize: 12 }}
                  onClick={clearDone}
                >
                  Очистить завершённые ({doneSessions.length})
                </button>
              ) : null}
            </div>
          </>
        )}

        {error ? <p className="error-text">{error}</p> : null}
      </section>

      {/* Terminals section */}
      {sessions.length > 0 ? (
        <section className="panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}>
              Терминалы
              <span className="muted" style={{ fontWeight: 400, fontSize: 13, marginLeft: 8 }}>
                {runningSessions.length} активных
              </span>
            </h3>
          </div>

          <div className="orch-terminals-grid">
            {sessions.map((session) => (
              <TerminalPanel
                key={session.id}
                session={session}
                client={client}
                onKill={() => handleKill(session.id)}
                onDelete={() => handleDelete(session.id)}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
