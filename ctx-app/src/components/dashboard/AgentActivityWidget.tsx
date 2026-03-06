import { useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';

export function AgentActivityWidget() {
    const state = useAppStore((s) => s.state);
    const pipelineStage = state?.pipeline?.stage || 'idle';
    const logs = state?.log || [];

    const defaultAgents = [
        { id: 'architect', name: 'Architect', role: 'System Design', stage: 'plan' },
        { id: 'implementer', name: 'Implementer', role: 'Code Generation', stage: 'execute' },
        { id: 'documenter', name: 'Documenter', role: 'Documentation', stage: 'execute' },
        { id: 'reviewer', name: 'Reviewer', role: 'Code Review', stage: 'execute' },
    ];

    const agents = state?.agents?.length ? state.agents : defaultAgents;

    const agentStatusLog = useMemo(() => {
        const statusMap = new Map();
        [...logs].reverse().forEach(log => {
            agents.forEach(agent => {
                if (!statusMap.has(agent.id) && log.action && (log.action.toLowerCase().includes(agent.id) || log.message?.toLowerCase().includes(agent.id))) {
                    statusMap.set(agent.id, log.message);
                }
            });
        });
        return statusMap;
    }, [logs, agents]);

    const [filter, setFilter] = useState<'all' | 'active'>('all');

    const displayAgents = useMemo(() => {
        return agents.filter(agent => {
            if (filter === 'all') return true;
            return pipelineStage === agent.stage;
        });
    }, [agents, filter, pipelineStage]);

    return (
        <section className="panel" style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                <h3 style={{ margin: 0 }}>Активность агентов</h3>
                <select
                    value={filter}
                    onChange={(e) => setFilter(e.target.value as 'all' | 'active')}
                    style={{ padding: '4px 8px', fontSize: 12, borderRadius: 4, border: '1px solid var(--border)' }}
                >
                    <option value="all">Все агенты ({agents.length})</option>
                    <option value="active">Только активные</option>
                </select>
            </div>

            <div style={{ display: 'grid', gap: '8px' }}>
                {displayAgents.length === 0 ? (
                    <div style={{ padding: '12px', textAlign: 'center', color: 'var(--muted)', fontSize: 13, background: 'var(--surface-alt)', borderRadius: 8 }}>
                        Нет активных агентов на данном этапе.
                    </div>
                ) : displayAgents.map((agent) => {
                    const isActive = pipelineStage === agent.stage;
                    const isDone = ['detect', 'context', 'task', 'brainstorm', 'plan', 'execute', 'done'].indexOf(pipelineStage) >
                        ['detect', 'context', 'task', 'brainstorm', 'plan', 'execute', 'done'].indexOf(agent.stage || 'done');

                    const statusText = isActive
                        ? (agentStatusLog.get(agent.id) || `Работает над: ${pipelineStage}...`)
                        : isDone
                            ? 'Завершено'
                            : 'Ожидает...';

                    return (
                        <div
                            key={agent.id}
                            style={{
                                display: 'grid',
                                gridTemplateColumns: 'minmax(100px, 1fr) 2fr',
                                gap: '12px',
                                padding: '10px 12px',
                                borderRadius: '8px',
                                border: `1px solid ${isActive ? 'var(--primary)' : 'var(--border)'}`,
                                background: isActive ? 'color-mix(in srgb, var(--primary) 5%, var(--surface-alt))' : 'var(--surface-alt)',
                                alignItems: 'center'
                            }}
                        >
                            <div>
                                <strong style={{ display: 'block', fontSize: '13px', color: isActive ? 'var(--primary)' : 'var(--text)' }}>
                                    {agent.name || agent.id}
                                </strong>
                                <span style={{ fontSize: '11px', color: 'var(--muted)' }}>{agent.role || 'Агент'}</span>
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}>
                                    <span style={{
                                        color: isActive ? 'var(--text)' : 'var(--muted)',
                                        whiteSpace: 'nowrap',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        maxWidth: '180px'
                                    }}>
                                        {statusText}
                                    </span>
                                    <span style={{
                                        color: isActive ? 'var(--primary)' : isDone ? 'var(--success)' : 'var(--muted)',
                                        fontWeight: 600
                                    }}>
                                        {isActive ? 'В процессе' : isDone ? '✓' : 'Idle'}
                                    </span>
                                </div>
                                <div style={{ height: '4px', background: 'color-mix(in srgb, var(--surface), #000 18%)', borderRadius: '2px', overflow: 'hidden' }}>
                                    <div style={{
                                        height: '100%',
                                        background: isActive ? 'var(--primary)' : isDone ? 'var(--success)' : 'transparent',
                                        width: isActive ? '60%' : isDone ? '100%' : '0%',
                                        transition: 'width 1s ease',
                                        animation: isActive ? 'pulse 2s infinite' : 'none'
                                    }} />
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <style>{`
        @keyframes pulse {
          0% { opacity: 0.6; }
          50% { opacity: 1; }
          100% { opacity: 0.6; }
        }
      `}</style>
        </section>
    );
}
