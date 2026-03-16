/**
 * TeamBuilder — consilium member selector.
 * Each member has: provider, model, role label.
 */

interface TeamMember {
  id: string;
  provider: string;
  model: string;
  role: string;
}

interface TeamBuilderProps {
  members: TeamMember[];
  onChange: (members: TeamMember[]) => void;
}

const PROVIDERS = ['claude', 'gemini', 'codex', 'opencode'] as const;

const PROVIDER_MODELS: Record<string, string[]> = {
  claude: ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
  gemini: ['gemini-3.1-pro-preview', 'gemini-3-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash'],
  codex: ['gpt-5.4'],
  opencode: ['zai-coding-plan/glm-5', 'zai-coding-plan/glm-4.7-flashx', 'zai/glm-5', 'zai/glm-4.7-flash']
};

const ROLES = [
  'architect',
  'researcher',
  'implementer',
  'reviewer',
  'tester',
  'custom'
];

function newMember(): TeamMember {
  return {
    id: Math.random().toString(36).slice(2, 9),
    provider: 'claude',
    model: 'claude-sonnet-4-6',
    role: 'implementer'
  };
}

export function TeamBuilder({ members, onChange }: TeamBuilderProps) {
  const add = () => {
    if (members.length >= 6) return;
    onChange([...members, newMember()]);
  };

  const remove = (id: string) => {
    onChange(members.filter((m) => m.id !== id));
  };

  const update = (id: string, patch: Partial<Omit<TeamMember, 'id'>>) => {
    onChange(members.map((m) => (m.id === id ? { ...m, ...patch } : m)));
  };

  const onProviderChange = (id: string, provider: string) => {
    const defaultModel = PROVIDER_MODELS[provider]?.[0] || '';
    update(id, { provider, model: defaultModel });
  };

  return (
    <div className="team-builder">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <strong style={{ fontSize: 12 }}>Участники консилиума</strong>
        <button
          type="button"
          className="dp-add-btn"
          onClick={add}
          disabled={members.length >= 6}
        >
          + Добавить
        </button>
      </div>

      {members.length === 0 ? (
        <p className="muted" style={{ fontSize: 12 }}>Участники не добавлены. Добавьте хотя бы одного провайдера.</p>
      ) : null}

      {members.map((m) => {
        const models = PROVIDER_MODELS[m.provider] || [];
        return (
          <div key={m.id} className="team-member-row">
            <select
              value={m.provider}
              onChange={(e) => onProviderChange(m.id, e.target.value)}
              aria-label="Provider"
            >
              {PROVIDERS.map((p) => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>

            <select
              value={m.model}
              onChange={(e) => update(m.id, { model: e.target.value })}
              aria-label="Model"
            >
              {models.map((mod) => (
                <option key={mod} value={mod}>{mod}</option>
              ))}
            </select>

            <select
              value={m.role}
              onChange={(e) => update(m.id, { role: e.target.value })}
              aria-label="Role"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>

            <button
              type="button"
              className="dp-remove-btn"
              onClick={() => remove(m.id)}
              aria-label="Remove member"
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
}

export type { TeamMember };
