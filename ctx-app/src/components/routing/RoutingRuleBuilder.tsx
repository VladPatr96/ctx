import { useState } from 'react';

interface RoutingRule {
    id: string;
    conditionLeft: string;
    conditionOp: string;
    conditionRight: string;
    actionType: string;
    actionValue: string;
}

export function RoutingRuleBuilder() {
    const [rules, setRules] = useState<RoutingRule[]>([
        {
            id: '1',
            conditionLeft: 'task.type',
            conditionOp: '==',
            conditionRight: 'security',
            actionType: 'provider',
            actionValue: 'codex'
        },
        {
            id: '2',
            conditionLeft: 'task.complexity',
            conditionOp: '>',
            conditionRight: '8',
            actionType: 'use_consillium',
            actionValue: 'full'
        },
        {
            id: '3',
            conditionLeft: 'claude_cost',
            conditionOp: '>',
            conditionRight: '$10',
            actionType: 'fallback_to',
            actionValue: 'gemini'
        }
    ]);

    const addRule = () => {
        setRules([...rules, {
            id: Date.now().toString(),
            conditionLeft: 'task.type',
            conditionOp: '==',
            conditionRight: '',
            actionType: 'provider',
            actionValue: ''
        }]);
    };

    const removeRule = (id: string) => {
        setRules(rules.filter(r => r.id !== id));
    };

    const updateRule = (id: string, field: keyof RoutingRule, value: string) => {
        setRules(rules.map(r => r.id === id ? { ...r, [field]: value } : r));
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <p style={{ fontSize: '13px', color: 'var(--muted)', margin: 0 }}>
                Настройте правила роутинга для автоматического выбора провайдера в зависимости от контекста задачи.
            </p>

            <div style={{ display: 'grid', gap: '12px' }}>
                {rules.map((rule, idx) => (
                    <div key={rule.id} style={{ display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--surface-alt)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
                        <span style={{ fontSize: '13px', color: 'var(--muted)', fontWeight: 'bold' }}>#{idx + 1}</span>
                        <span style={{ fontSize: '13px', color: 'var(--text)' }}>If</span>

                        <input
                            value={rule.conditionLeft}
                            onChange={e => updateRule(rule.id, 'conditionLeft', e.target.value)}
                            style={{ width: '130px', fontFamily: 'monospace', fontSize: '12px' }}
                        />

                        <select
                            value={rule.conditionOp}
                            onChange={e => updateRule(rule.id, 'conditionOp', e.target.value)}
                            style={{ width: '60px' }}
                        >
                            <option value="==">==</option>
                            <option value="!=">!=</option>
                            <option value=">">&gt;</option>
                            <option value="<">&lt;</option>
                            <option value="contains">contains</option>
                        </select>

                        <input
                            value={rule.conditionRight}
                            onChange={e => updateRule(rule.id, 'conditionRight', e.target.value)}
                            style={{ width: '100px', fontFamily: 'monospace', fontSize: '12px' }}
                            placeholder="value"
                        />

                        <span style={{ fontSize: '13px', color: 'var(--text)', margin: '0 8px' }}>→</span>

                        <select
                            value={rule.actionType}
                            onChange={e => updateRule(rule.id, 'actionType', e.target.value)}
                            style={{ width: '130px' }}
                        >
                            <option value="provider">provider :=</option>
                            <option value="fallback_to">fallback :=</option>
                            <option value="use_consillium">use_consillium :=</option>
                        </select>

                        <input
                            value={rule.actionValue}
                            onChange={e => updateRule(rule.id, 'actionValue', e.target.value)}
                            style={{ width: '120px', fontFamily: 'monospace', fontSize: '12px' }}
                            placeholder="action"
                        />

                        <button
                            type="button"
                            onClick={() => removeRule(rule.id)}
                            style={{ marginLeft: 'auto', padding: '6px 12px', background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)', fontSize: '12px' }}
                        >
                            Удалить
                        </button>
                    </div>
                ))}
                {rules.length === 0 && <p className="muted">Нет правил роутинга.</p>}
            </div>

            <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button type="button" onClick={addRule} style={{ background: 'transparent', color: 'var(--text)' }}>
                    + Add Rule
                </button>
                <button type="button" style={{ background: 'var(--surface-alt)', color: 'var(--text)' }}>
                    Test Rule
                </button>
                <button type="button" style={{ marginLeft: 'auto', background: 'var(--primary)', color: 'white' }}>
                    Save Rules
                </button>
            </div>
        </div>
    );
}
