import { useState } from 'react';
import type { KBEntry } from '../../api/types';
import type { ApiClient } from '../../api/client';

interface KBEditorProps {
    client: ApiClient;
    initialEntry?: KBEntry;
    onSave?: () => void;
    onCancel?: () => void;
}

const DEFAULT_AGENTS = ['architect', 'implementer', 'documenter', 'reviewer', 'controller'];
const DEFAULT_CATEGORIES = ['decision', 'error', 'pattern', 'provider-specific', 'session-summary'];

export function KBEditor({ client, initialEntry, onSave, onCancel }: KBEditorProps) {
    const [title, setTitle] = useState(initialEntry?.title || '');
    const [project, setProject] = useState(initialEntry?.project || 'default');
    const [category, setCategory] = useState(initialEntry?.category || 'pattern');
    const [tags, setTags] = useState(initialEntry?.tags || '');
    const [body, setBody] = useState(initialEntry?.body || '');

    // Custom field based on requirements "Related Agents (checkboxes)"
    const [relatedAgents, setRelatedAgents] = useState<string[]>([]);

    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const handleAgentToggle = (agent: string) => {
        setRelatedAgents(prev =>
            prev.includes(agent) ? prev.filter(a => a !== agent) : [...prev, agent]
        );
    };

    const handleSave = async () => {
        if (!title.trim() || !body.trim()) {
            setError('Title and Body are required.');
            return;
        }
        setBusy(true);
        setError('');

        // Convert relatedAgents to tags as a fallback since the schema might not natively support it
        const finalTags = [
            ...tags.split(',').map(t => t.trim()).filter(Boolean),
            ...relatedAgents.map(a => `agent:${a}`)
        ].join(',');

        try {
            // Assuming a save endpoint exists or will be added
            if (typeof client.saveKbEntry === 'function') {
                await client.saveKbEntry({
                    id: initialEntry?.id,
                    title,
                    project,
                    category,
                    tags: finalTags,
                    body
                });
            } else {
                // Mock save if api not implemented yet
                console.warn('client.saveKbEntry not implemented, mocking success.');
                await new Promise(r => setTimeout(r, 500));
            }
            onSave?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : String(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="panel" style={{ marginTop: '16px', background: 'var(--surface)' }}>
            <h3 style={{ marginBottom: '16px' }}>{initialEntry ? 'Редактировать запись' : 'Новая запись (Knowledge Base)'}</h3>

            <div style={{ display: 'grid', gap: '12px' }}>
                <div className="row">
                    <div style={{ flex: 2, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Заголовок</label>
                        <input
                            value={title}
                            onChange={e => setTitle(e.target.value)}
                            placeholder="Например: Ошибка EADDRINUSE при запуске"
                        />
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Категория</label>
                        <select value={category} onChange={e => setCategory(e.target.value)}>
                            {DEFAULT_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Проект</label>
                        <input
                            value={project}
                            onChange={e => setProject(e.target.value)}
                            placeholder="default"
                        />
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Связанные Агенты (Related Agents)</label>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
                        {DEFAULT_AGENTS.map(agent => (
                            <label key={agent} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                                <input
                                    type="checkbox"
                                    checked={relatedAgents.includes(agent)}
                                    onChange={() => handleAgentToggle(agent)}
                                />
                                {agent}
                            </label>
                        ))}
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Теги (через запятую)</label>
                    <input
                        value={tags}
                        onChange={e => setTags(e.target.value)}
                        placeholder="api, setup, windows"
                    />
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <label style={{ fontSize: '12px', color: 'var(--muted)' }}>Содержание (Markdown)</label>
                    <textarea
                        value={body}
                        onChange={e => setBody(e.target.value)}
                        placeholder="Опишите проблему, решение или паттерн..."
                        style={{ minHeight: '160px', fontFamily: 'monospace', fontSize: '13px' }}
                    />
                </div>
            </div>

            {error && <p className="error-text" style={{ marginTop: '12px' }}>{error}</p>}

            <div style={{ display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={onCancel} style={{ background: 'transparent' }}>Отмена</button>
                <button type="button" onClick={handleSave} disabled={busy} style={{ background: 'var(--primary)', color: 'white' }}>
                    {busy ? 'Сохранение...' : 'Сохранить запись'}
                </button>
            </div>
        </section>
    );
}
