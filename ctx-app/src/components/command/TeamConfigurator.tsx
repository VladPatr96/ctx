import { useState } from 'react';
import { type ProviderModels, getModelIds, getDefaultModel } from './useProviderModels';

export interface TeamMember {
  id: string;
  provider: string;
  model: string;
  role: string;
}

export interface TeamConfig {
  id: string;
  name: string;
  leadProvider: string;
  leadModel: string;
  members: TeamMember[];
  createdAt: number;
  lastUsedAt: number;
}

const PROVIDERS = ['claude', 'gemini', 'codex', 'opencode'] as const;
const ROLES = ['architect', 'researcher', 'implementer', 'reviewer', 'tester'];

const TEAM_STORAGE_KEY = 'ctx-saved-teams';

/** Build default presets using discovered models (called once after model discovery) */
export function buildDefaultPresets(pm: ProviderModels): TeamConfig[] {
  return [
    {
      id: 'preset-full-council',
      name: 'Полный совет',
      leadProvider: 'claude',
      leadModel: getDefaultModel(pm, 'claude'),
      members: [
        { id: 'p1', provider: 'gemini', model: getDefaultModel(pm, 'gemini'), role: 'architect' },
        { id: 'p2', provider: 'codex', model: getDefaultModel(pm, 'codex'), role: 'reviewer' },
        { id: 'p3', provider: 'claude', model: getModelIds(pm, 'claude')[1] || getDefaultModel(pm, 'claude'), role: 'implementer' },
      ],
      createdAt: 0,
      lastUsedAt: 0,
    },
    {
      id: 'preset-fast-duo',
      name: 'Быстрый дуэт',
      leadProvider: 'claude',
      leadModel: getModelIds(pm, 'claude')[1] || getDefaultModel(pm, 'claude'),
      members: [
        { id: 'p1', provider: 'gemini', model: fastModelFor(pm, 'gemini'), role: 'researcher' },
      ],
      createdAt: 0,
      lastUsedAt: 0,
    },
    {
      id: 'preset-code-review',
      name: 'Code Review',
      leadProvider: 'claude',
      leadModel: getDefaultModel(pm, 'claude'),
      members: [
        { id: 'p1', provider: 'codex', model: getDefaultModel(pm, 'codex'), role: 'reviewer' },
        { id: 'p2', provider: 'claude', model: getModelIds(pm, 'claude')[1] || getDefaultModel(pm, 'claude'), role: 'tester' },
      ],
      createdAt: 0,
      lastUsedAt: 0,
    },
    {
      id: 'preset-research',
      name: 'Исследование',
      leadProvider: 'claude',
      leadModel: getDefaultModel(pm, 'claude'),
      members: [
        { id: 'p1', provider: 'gemini', model: getDefaultModel(pm, 'gemini'), role: 'researcher' },
        { id: 'p2', provider: 'opencode', model: getDefaultModel(pm, 'opencode'), role: 'researcher' },
      ],
      createdAt: 0,
      lastUsedAt: 0,
    },
  ];
}

function fastModelFor(pm: ProviderModels, provider: string): string {
  const fast = pm[provider]?.models?.find((m) => m.tier === 'fast');
  return fast?.id || getDefaultModel(pm, provider);
}

// Legacy export for backward compat (will be replaced after model discovery)
export const DEFAULT_PRESETS: TeamConfig[] = buildDefaultPresets({
  claude: { models: [{ id: 'claude-opus-4-6', alias: 'opus', tier: 'flagship' }, { id: 'claude-sonnet-4-6', alias: 'sonnet', tier: 'balanced' }, { id: 'claude-haiku-4-5-20251001', alias: 'haiku', tier: 'fast' }], defaultModel: 'claude-opus-4-6' },
  gemini: { models: [{ id: 'gemini-3.1-pro-preview', alias: '3.1-pro', tier: 'flagship' }, { id: 'gemini-3-pro-preview', alias: '3-pro', tier: 'balanced' }, { id: 'gemini-3-flash-preview', alias: '3-flash', tier: 'fast' }], defaultModel: 'gemini-3.1-pro-preview' },
  codex: { models: [{ id: 'gpt-5.4', alias: 'gpt-5.4', tier: 'flagship' }], defaultModel: 'gpt-5.4' },
  opencode: { models: [{ id: 'zai-coding-plan/glm-5', alias: 'glm-5-plan', tier: 'flagship' }, { id: 'zai/glm-5', alias: 'glm-5', tier: 'balanced' }], defaultModel: 'zai-coding-plan/glm-5' },
});

export function loadSavedTeams(): TeamConfig[] {
  try {
    const raw = localStorage.getItem(TEAM_STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export function persistTeams(teams: TeamConfig[]) {
  try {
    localStorage.setItem(TEAM_STORAGE_KEY, JSON.stringify(teams));
  } catch { /* ignore */ }
}

interface TeamConfiguratorProps {
  teams: TeamConfig[];
  activeTeamId: string;
  onSelectTeam: (id: string) => void;
  onUpdateTeams: (teams: TeamConfig[]) => void;
  providerModels: ProviderModels;
}

export function TeamConfigurator({ teams, activeTeamId, onSelectTeam, onUpdateTeams, providerModels }: TeamConfiguratorProps) {
  const [editing, setEditing] = useState(false);
  const [editTeam, setEditTeam] = useState<TeamConfig | null>(null);

  const activeTeam = teams.find((t) => t.id === activeTeamId);

  const startNewTeam = () => {
    const newTeam: TeamConfig = {
      id: 'team-' + Date.now(),
      name: 'Новая команда',
      leadProvider: 'claude',
      leadModel: getDefaultModel(providerModels, 'claude'),
      members: [],
      createdAt: Date.now(),
      lastUsedAt: 0,
    };
    setEditTeam(newTeam);
    setEditing(true);
  };

  const startEditTeam = (team: TeamConfig) => {
    setEditTeam({ ...team, members: team.members.map((m) => ({ ...m })) });
    setEditing(true);
  };

  const saveEditTeam = () => {
    if (!editTeam) return;
    const exists = teams.find((t) => t.id === editTeam.id);
    if (exists) {
      onUpdateTeams(teams.map((t) => (t.id === editTeam.id ? editTeam : t)));
    } else {
      onUpdateTeams([...teams, editTeam]);
    }
    onSelectTeam(editTeam.id);
    setEditing(false);
    setEditTeam(null);
  };

  const deleteTeam = (id: string) => {
    const updated = teams.filter((t) => t.id !== id);
    onUpdateTeams(updated);
    if (activeTeamId === id && updated.length > 0) {
      onSelectTeam(updated[0].id);
    }
  };

  const addMember = () => {
    if (!editTeam || editTeam.members.length >= 6) return;
    setEditTeam({
      ...editTeam,
      members: [
        ...editTeam.members,
        {
          id: 'm-' + Date.now(),
          provider: 'gemini',
          model: getDefaultModel(providerModels, 'gemini'),
          role: 'implementer',
        },
      ],
    });
  };

  const removeMember = (id: string) => {
    if (!editTeam) return;
    setEditTeam({
      ...editTeam,
      members: editTeam.members.filter((m) => m.id !== id),
    });
  };

  const updateMember = (id: string, patch: Partial<TeamMember>) => {
    if (!editTeam) return;
    setEditTeam({
      ...editTeam,
      members: editTeam.members.map((m) => {
        if (m.id !== id) return m;
        const updated = { ...m, ...patch };
        // Auto-update model when provider changes
        if (patch.provider && patch.provider !== m.provider) {
          updated.model = getDefaultModel(providerModels, patch.provider);
        }
        return updated;
      }),
    });
  };

  // EDIT MODE
  if (editing && editTeam) {
    const leadModels = getModelIds(providerModels, editTeam.leadProvider);
    return (
      <div className="tc-editor">
        <h4 className="tc-title">Редактирование команды</h4>
        <div className="tc-field">
          <label>Название</label>
          <input
            type="text"
            value={editTeam.name}
            onChange={(e) => setEditTeam({ ...editTeam, name: e.target.value })}
            className="tc-input"
          />
        </div>

        <div className="tc-field">
          <label>Lead Provider</label>
          <div className="tc-row">
            <select
              value={editTeam.leadProvider}
              onChange={(e) => {
                const provider = e.target.value;
                setEditTeam({
                  ...editTeam,
                  leadProvider: provider,
                  leadModel: getDefaultModel(providerModels, provider),
                });
              }}
              className="tc-select"
            >
              {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <select
              value={editTeam.leadModel}
              onChange={(e) => setEditTeam({ ...editTeam, leadModel: e.target.value })}
              className="tc-select"
            >
              {leadModels.map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div className="tc-field">
          <div className="tc-members-header">
            <label>Участники ({editTeam.members.length}/6)</label>
            <button type="button" className="tc-add-btn" onClick={addMember} disabled={editTeam.members.length >= 6}>
              + Добавить
            </button>
          </div>
          {editTeam.members.map((m) => {
            const models = getModelIds(providerModels, m.provider);
            return (
              <div key={m.id} className="tc-member-row">
                <select value={m.role} onChange={(e) => updateMember(m.id, { role: e.target.value })} className="tc-select tc-select-sm">
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <select value={m.provider} onChange={(e) => updateMember(m.id, { provider: e.target.value })} className="tc-select tc-select-sm">
                  {PROVIDERS.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
                <select value={m.model} onChange={(e) => updateMember(m.id, { model: e.target.value })} className="tc-select tc-select-sm">
                  {models.map((mod) => <option key={mod} value={mod}>{mod}</option>)}
                </select>
                <button type="button" className="tc-remove-btn" onClick={() => removeMember(m.id)}>x</button>
              </div>
            );
          })}
        </div>

        <div className="tc-editor-actions">
          <button type="button" className="cc-btn cc-btn-primary" onClick={saveEditTeam}>Сохранить</button>
          <button type="button" className="cc-btn cc-btn-ghost" onClick={() => { setEditing(false); setEditTeam(null); }}>Отмена</button>
        </div>
      </div>
    );
  }

  // LIST MODE
  return (
    <div className="tc-list">
      <div className="tc-list-header">
        <h4 className="tc-title">Команды</h4>
        <button type="button" className="tc-add-btn" onClick={startNewTeam}>+ Новая</button>
      </div>

      <div className="tc-cards">
        {teams.map((team) => {
          const isActive = team.id === activeTeamId;
          return (
            <div
              key={team.id}
              className={`tc-card ${isActive ? 'tc-card-active' : ''}`}
              onClick={() => onSelectTeam(team.id)}
            >
              <div className="tc-card-header">
                <span className="tc-card-name">{team.name}</span>
                <span className="tc-card-count">{team.members.length + 1}</span>
              </div>
              <div className="tc-card-detail">
                <span className={`cc-provider-dot cc-provider-${team.leadProvider}`} />
                <span className="tc-card-lead">Lead: {team.leadProvider}</span>
              </div>
              <div className="tc-card-members">
                {team.members.slice(0, 3).map((m) => (
                  <span key={m.id} className="tc-member-chip">
                    {m.role}
                  </span>
                ))}
                {team.members.length > 3 && (
                  <span className="tc-member-chip tc-member-more">+{team.members.length - 3}</span>
                )}
              </div>
              {isActive && (
                <div className="tc-card-actions" onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="tc-action-btn" onClick={() => startEditTeam(team)}>Edit</button>
                  {!team.id.startsWith('preset-') && (
                    <button type="button" className="tc-action-btn tc-action-danger" onClick={() => deleteTeam(team.id)}>Del</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
