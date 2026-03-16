import { useState, useCallback, useEffect, useMemo } from 'react';
import type { ApiClient, TerminalSession, CreateSessionOpts } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { TerminalPanel } from '../components/orchestrator/TerminalPanel';
import { CommandBar } from '../components/command/CommandBar';
import { TeamConfigurator, type TeamConfig, loadSavedTeams, persistTeams, DEFAULT_PRESETS, buildDefaultPresets } from '../components/command/TeamConfigurator';
import { useProviderModels, getDefaultModel } from '../components/command/useProviderModels';
import { BrainstormView } from '../components/command/BrainstormView';
import { ProjectSetup } from '../components/command/ProjectSetup';
import { StatusBar } from '../components/command/StatusBar';

type WorkspaceMode = 'setup' | 'brainstorm' | 'execute' | 'review';

const MODE_LABELS: Record<WorkspaceMode, string> = {
  setup: 'Настройка',
  brainstorm: 'Мозговой штурм',
  execute: 'Выполнение',
  review: 'Результаты',
};

interface CommandCenterProps {
  client: ApiClient;
}

export function CommandCenterPage({ client }: CommandCenterProps) {
  const state = useAppStore((s) => s.state);

  // Provider models (loaded from backend discovery)
  const { providerModels } = useProviderModels(client);

  // Core state
  const [mode, setMode] = useState<WorkspaceMode>('setup');
  const [task, setTask] = useState('');
  const [sessions, setSessions] = useState<TerminalSession[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [presetsInitialized, setPresetsInitialized] = useState(false);

  // Team state
  const [savedTeams, setSavedTeams] = useState<TeamConfig[]>(() => {
    const loaded = loadSavedTeams();
    return loaded.length > 0 ? loaded : DEFAULT_PRESETS;
  });

  // Rebuild default presets when real models arrive
  useEffect(() => {
    if (presetsInitialized) return;
    const hasRealModels = Object.values(providerModels).some((p) => p.models.length > 1);
    if (!hasRealModels) return;
    setPresetsInitialized(true);

    const userTeams = loadSavedTeams();
    if (userTeams.length > 0) return; // user has custom teams, don't overwrite

    const fresh = buildDefaultPresets(providerModels);
    setSavedTeams(fresh);
    persistTeams(fresh);
  }, [providerModels, presetsInitialized]);
  const [activeTeamId, setActiveTeamId] = useState<string>(savedTeams[0]?.id || '');
  const activeTeam = useMemo(
    () => savedTeams.find((t) => t.id === activeTeamId) || savedTeams[0] || null,
    [savedTeams, activeTeamId]
  );

  // Brainstorm state
  const [brainstormTopic, setBrainstormTopic] = useState('');
  const [brainstormSessions, setBrainstormSessions] = useState<string[]>([]);
  const [synthesisText, setSynthesisText] = useState('');

  // Fetch existing sessions on mount
  useEffect(() => {
    client.listTerminalSessions().then(setSessions).catch(() => {});
  }, [client]);

  // Poll sessions for status updates
  useEffect(() => {
    const interval = setInterval(() => {
      client.listTerminalSessions().then(setSessions).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [client]);

  // Persist teams
  const updateTeams = useCallback((teams: TeamConfig[]) => {
    setSavedTeams(teams);
    persistTeams(teams);
  }, []);

  // Command handling
  const handleCommand = useCallback(async (command: string) => {
    const trimmed = command.trim();
    if (!trimmed) return;

    // Parse slash commands
    if (trimmed.startsWith('/')) {
      const parts = trimmed.slice(1).split(/\s+/);
      const cmd = parts[0]?.toLowerCase();
      const arg = parts.slice(1).join(' ');

      switch (cmd) {
        case 'brainstorm':
          setBrainstormTopic(arg || task);
          setMode('brainstorm');
          return;
        case 'execute':
        case 'run':
          setMode('execute');
          if (arg) setTask(arg);
          return;
        case 'review':
          setMode('review');
          return;
        case 'setup':
          setMode('setup');
          return;
        case 'task':
          if (arg) {
            setTask(arg);
            try {
              await client.setTask(arg);
            } catch { /* ignore */ }
          }
          return;
        case 'lead': {
          if (arg && activeTeam) {
            const updated = savedTeams.map((t) =>
              t.id === activeTeam.id ? { ...t, leadProvider: arg } : t
            );
            updateTeams(updated);
          }
          return;
        }
        case 'delegate': {
          if (arg && activeTeam) {
            await launchSingleAgent(arg, activeTeam.leadProvider, activeTeam.leadModel);
            setMode('execute');
          }
          return;
        }
        default:
          setError(`Unknown command: /${cmd}`);
          return;
      }
    }

    // Default: treat as task
    setTask(trimmed);
    try {
      await client.setTask(trimmed);
    } catch { /* ignore */ }
  }, [task, activeTeam, savedTeams, updateTeams, client]);

  // Launch a single agent session
  const launchSingleAgent = useCallback(async (
    agentTask: string,
    provider: string,
    model: string,
    label?: string
  ): Promise<string | null> => {
    try {
      const sessionId = await client.createTerminalSession({
        provider,
        model,
        task: agentTask,
        label: label || `${provider}/${model}`,
      });
      setSessions((prev) => [
        ...prev,
        {
          id: sessionId,
          provider,
          model,
          label: label || `${provider}/${model}`,
          branch: '',
          status: 'starting',
          startedAt: Date.now(),
          ringSize: 0,
        },
      ]);
      return sessionId;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return null;
    }
  }, [client]);

  // Launch full team orchestration
  const launchTeam = useCallback(async () => {
    if (!activeTeam || !task.trim()) {
      setError('Укажите задачу и выберите команду');
      return;
    }
    setBusy(true);
    setError('');

    try {
      // Set task in pipeline
      await client.setTask(task.trim());
      await client.setStage('execute');

      // Launch lead
      const leadId = await launchSingleAgent(
        task.trim(),
        activeTeam.leadProvider,
        activeTeam.leadModel,
        `Lead: ${activeTeam.leadProvider}/${activeTeam.leadModel}`
      );

      // Launch team members
      for (const member of activeTeam.members) {
        await launchSingleAgent(
          task.trim(),
          member.provider,
          member.model,
          `${member.role}: ${member.provider}/${member.model}`
        );
      }

      // Update team lastUsedAt
      updateTeams(
        savedTeams.map((t) =>
          t.id === activeTeam.id ? { ...t, lastUsedAt: Date.now() } : t
        )
      );

      setMode('execute');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [activeTeam, task, client, launchSingleAgent, savedTeams, updateTeams]);

  // Launch brainstorm
  const launchBrainstorm = useCallback(async (topic: string) => {
    if (!activeTeam || !topic.trim()) return;
    setBusy(true);
    setError('');
    setBrainstormSessions([]);

    try {
      const prefix = `[BRAINSTORM] Analyze from your perspective as a specialist. Topic: ${topic.trim()}\n\nProvide your analysis, key considerations, and recommendations.`;

      // Launch each team member with brainstorm prompt
      const newSessionIds: string[] = [];

      // Lead brainstorms too
      const leadId = await launchSingleAgent(
        prefix,
        activeTeam.leadProvider,
        activeTeam.leadModel,
        `Brainstorm Lead: ${activeTeam.leadProvider}`
      );
      if (leadId) newSessionIds.push(leadId);

      for (const member of activeTeam.members) {
        const sid = await launchSingleAgent(
          `${prefix}\n\nYour role: ${member.role}`,
          member.provider,
          member.model,
          `Brainstorm ${member.role}: ${member.provider}`
        );
        if (sid) newSessionIds.push(sid);
      }

      setBrainstormSessions(newSessionIds);
      setMode('brainstorm');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [activeTeam, launchSingleAgent]);

  // Kill session
  const handleKill = useCallback(async (sessionId: string) => {
    try {
      await client.killTerminalSession(sessionId);
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: 'done' } : s))
      );
    } catch { /* ignore */ }
  }, [client]);

  // Delete session
  const handleDelete = useCallback(async (sessionId: string) => {
    try {
      await client.deleteTerminalSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      setBrainstormSessions((prev) => prev.filter((id) => id !== sessionId));
    } catch { /* ignore */ }
  }, [client]);

  // Computed values
  const activeSessions = sessions.filter(
    (s) => s.status === 'running' || s.status === 'starting'
  );
  const doneSessions = sessions.filter(
    (s) => s.status === 'done' || s.status === 'error'
  );
  const brainstormSessionObjects = sessions.filter(
    (s) => brainstormSessions.includes(s.id)
  );

  const pipelineStage = state?.pipeline?.stage || 'idle';
  const projectName = (state as Record<string, unknown> | null)?.project
    ? ((state as Record<string, unknown>).project as Record<string, string>)?.name
    : undefined;

  // Clear done sessions
  const clearDone = async () => {
    for (const s of doneSessions) {
      try { await client.deleteTerminalSession(s.id); } catch { /* ignore */ }
    }
    setSessions((prev) => prev.filter((s) => s.status !== 'done' && s.status !== 'error'));
  };

  return (
    <div className="cc-container">
      {/* Command Bar */}
      <CommandBar
        onCommand={handleCommand}
        task={task}
        onTaskChange={setTask}
        pipelineStage={pipelineStage}
        projectName={projectName}
      />

      {error && <div className="cc-error">{error}<button type="button" onClick={() => setError('')} className="cc-error-close">x</button></div>}

      {/* Workspace Mode Tabs */}
      <div className="cc-mode-tabs">
        {(Object.keys(MODE_LABELS) as WorkspaceMode[]).map((m) => (
          <button
            key={m}
            type="button"
            className={`cc-mode-tab ${mode === m ? 'active' : ''}`}
            onClick={() => setMode(m)}
          >
            <span className="cc-mode-label">{MODE_LABELS[m]}</span>
            {m === 'execute' && activeSessions.length > 0 && (
              <span className="cc-mode-badge">{activeSessions.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Main workspace */}
      <div className="cc-workspace">
        {/* Left sidebar: Team config */}
        <aside className="cc-sidebar-panel">
          <TeamConfigurator
            teams={savedTeams}
            activeTeamId={activeTeamId}
            onSelectTeam={setActiveTeamId}
            onUpdateTeams={updateTeams}
            providerModels={providerModels}
          />
        </aside>

        {/* Main content area */}
        <div className="cc-main-area">
          {/* SETUP MODE */}
          {mode === 'setup' && (
            <div className="cc-setup">
              <ProjectSetup client={client} onReady={() => {
                const taskInput = document.querySelector('.cc-task-textarea') as HTMLTextAreaElement | null;
                taskInput?.focus();
              }} />

              <div className="cc-setup-task">
                <h3>Задача</h3>
                <textarea
                  className="cc-task-textarea"
                  value={task}
                  onChange={(e) => setTask(e.target.value)}
                  placeholder="Подробно опишите задачу для команды..."
                  rows={5}
                />
                <div className="cc-setup-actions">
                  <button
                    type="button"
                    className="cc-btn cc-btn-primary"
                    onClick={launchTeam}
                    disabled={busy || !task.trim() || !activeTeam}
                  >
                    {busy ? 'Запуск...' : 'Запустить команду'}
                  </button>
                  <button
                    type="button"
                    className="cc-btn cc-btn-secondary"
                    onClick={() => {
                      setBrainstormTopic(task);
                      setMode('brainstorm');
                    }}
                    disabled={!task.trim() || !activeTeam}
                  >
                    Сначала обсудить
                  </button>
                  <button
                    type="button"
                    className="cc-btn cc-btn-ghost"
                    onClick={() => {
                      if (task.trim() && activeTeam) {
                        const provider = activeTeam.leadProvider;
                        const model = activeTeam.leadModel;
                        launchSingleAgent(task.trim(), provider, model, `Quick: ${provider}/${model}`);
                        setMode('execute');
                      }
                    }}
                    disabled={!task.trim() || !activeTeam}
                  >
                    Быстрый запуск (только Lead)
                  </button>
                </div>
              </div>

              {/* Active team summary */}
              {activeTeam && (
                <div className="cc-team-summary">
                  <h4>Текущая команда: {activeTeam.name}</h4>
                  <div className="cc-team-summary-grid">
                    <div className="cc-team-member-pill cc-team-lead">
                      <span className="cc-role-badge">Lead</span>
                      <span>{activeTeam.leadProvider}/{activeTeam.leadModel}</span>
                    </div>
                    {activeTeam.members.map((m) => (
                      <div key={m.id} className="cc-team-member-pill">
                        <span className="cc-role-badge">{m.role}</span>
                        <span>{m.provider}/{m.model}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick delegate */}
              <div className="cc-quick-delegate">
                <h4>Быстрое делегирование</h4>
                <p className="cc-muted">Отправьте задачу конкретному агенту</p>
                <div className="cc-delegate-grid">
                  {['claude', 'gemini', 'codex', 'opencode'].map((provider) => (
                    <button
                      key={provider}
                      type="button"
                      className="cc-delegate-btn"
                      onClick={async () => {
                        if (!task.trim()) return;
                        const model = getDefaultModel(providerModels, provider);
                        await launchSingleAgent(task.trim(), provider, model, `Delegate: ${provider}`);
                        setMode('execute');
                      }}
                      disabled={!task.trim()}
                    >
                      <span className={`cc-provider-dot cc-provider-${provider}`} />
                      {provider}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* BRAINSTORM MODE */}
          {mode === 'brainstorm' && (
            <BrainstormView
              topic={brainstormTopic || task}
              onTopicChange={setBrainstormTopic}
              sessions={brainstormSessionObjects}
              client={client}
              onLaunch={() => launchBrainstorm(brainstormTopic || task)}
              onKill={handleKill}
              onDelete={handleDelete}
              busy={busy}
              activeTeam={activeTeam}
              synthesisText={synthesisText}
              onSynthesisChange={setSynthesisText}
            />
          )}

          {/* EXECUTE MODE */}
          {mode === 'execute' && (
            <div className="cc-execute">
              <div className="cc-execute-header">
                <h3>
                  Активные сессии
                  <span className="cc-muted cc-count">({activeSessions.length} активных, {doneSessions.length} завершённых)</span>
                </h3>
                <div className="cc-execute-actions">
                  {doneSessions.length > 0 && (
                    <button type="button" className="cc-btn cc-btn-ghost" onClick={clearDone}>
                      Очистить завершённые
                    </button>
                  )}
                </div>
              </div>

              {sessions.length === 0 ? (
                <div className="cc-empty-state">
                  <p>Нет активных сессий</p>
                  <p className="cc-muted">Перейдите в Настройку и запустите команду, или используйте Command Bar.</p>
                  <button type="button" className="cc-btn cc-btn-primary" onClick={() => setMode('setup')}>
                    Перейти к настройке
                  </button>
                </div>
              ) : (
                <div className="cc-terminals-grid">
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
              )}
            </div>
          )}

          {/* REVIEW MODE */}
          {mode === 'review' && (
            <div className="cc-review">
              <h3>Обзор результатов</h3>

              {doneSessions.length === 0 && activeSessions.length === 0 ? (
                <div className="cc-empty-state">
                  <p>Нет результатов для обзора</p>
                  <p className="cc-muted">Запустите задачу или мозговой штурм, чтобы получить результаты.</p>
                </div>
              ) : (
                <div className="cc-review-content">
                  {/* Synthesis area */}
                  <div className="cc-synthesis-panel">
                    <h4>Синтез</h4>
                    <textarea
                      className="cc-synthesis-textarea"
                      value={synthesisText}
                      onChange={(e) => setSynthesisText(e.target.value)}
                      placeholder="Запишите ключевые решения, выводы и следующие шаги..."
                      rows={8}
                    />
                    <div className="cc-synthesis-actions">
                      <button
                        type="button"
                        className="cc-btn cc-btn-secondary"
                        onClick={async () => {
                          if (!synthesisText.trim()) return;
                          try {
                            await client.saveKbEntry({
                              title: `Decision: ${task.slice(0, 80)}`,
                              body: synthesisText,
                              category: 'decision',
                              project: projectName || 'unknown',
                            });
                            setError('');
                          } catch (err) {
                            setError('Failed to save: ' + (err instanceof Error ? err.message : String(err)));
                          }
                        }}
                        disabled={!synthesisText.trim()}
                      >
                        Сохранить в Knowledge Base
                      </button>
                    </div>
                  </div>

                  {/* Session summaries */}
                  <div className="cc-review-sessions">
                    <h4>Завершённые сессии ({doneSessions.length})</h4>
                    {doneSessions.map((s) => (
                      <div key={s.id} className="cc-review-session-card">
                        <div className="cc-review-session-header">
                          <span className={`cc-provider-dot cc-provider-${s.provider}`} />
                          <strong>{s.label}</strong>
                          <span className={`cc-status-badge cc-status-${s.status}`}>{s.status}</span>
                        </div>
                        <div className="cc-review-session-actions">
                          <button type="button" className="cc-btn cc-btn-ghost" onClick={() => handleDelete(s.id)}>
                            Удалить
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Status Bar */}
      <StatusBar
        activeSessions={activeSessions.length}
        totalSessions={sessions.length}
        pipelineStage={pipelineStage}
        activeTeamName={activeTeam?.name}
        mode={mode}
      />
    </div>
  );
}

