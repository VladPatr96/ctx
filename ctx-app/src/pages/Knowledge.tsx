import { useEffect, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { KBStats, KBEntry } from '../api/types';
import { KBSearch } from '../components/knowledge/KBSearch';
import { KBEditor } from '../components/knowledge/KBEditor';

interface KnowledgePageProps {
  client: ApiClient;
}

const EMPTY_STATS: KBStats = { total: 0, byCategory: {}, byProject: {} };

export function KnowledgePage({ client }: KnowledgePageProps) {
  const [stats, setStats] = useState<KBStats>(EMPTY_STATS);
  const [error, setError] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KBEntry | null>(null);

  useEffect(() => {
    refreshStats();
  }, [client]);

  const refreshStats = () => {
    client.getKbStats()
      .then((data) => {
        setStats(data);
        setError('');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  };

  const handleSave = () => {
    setIsAdding(false);
    setEditingEntry(null);
    refreshStats();
  };

  const isEditorOpen = isAdding || editingEntry !== null;

  return (
    <div className="page-grid">
      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0 }}>Статистика базы знаний</h3>
          <button
            type="button"
            onClick={() => { setIsAdding(!isAdding); setEditingEntry(null); }}
            style={{
              fontSize: '12px',
              padding: '6px 12px',
              background: isAdding ? 'transparent' : 'var(--primary)',
              color: isAdding ? 'var(--text)' : 'white',
              borderColor: isAdding ? 'var(--border)' : 'var(--primary)',
            }}
          >
            {isAdding ? 'Отмена' : '+ Добавить запись'}
          </button>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <p className="metric">Всего записей: {stats.total}</p>
        <ul className="mini-list">
          {Object.entries(stats.byCategory).map(([name, count]) => (
            <li key={name}>
              <span>{name}</span>
              <span>{count}</span>
            </li>
          ))}
        </ul>
      </section>

      {isEditorOpen ? (
        <KBEditor
          client={client}
          initialEntry={editingEntry || undefined}
          onSave={handleSave}
          onCancel={() => { setIsAdding(false); setEditingEntry(null); }}
        />
      ) : (
        <KBSearch
          client={client}
          stats={stats}
          onEdit={(entry) => setEditingEntry(entry)}
        />
      )}
    </div>
  );
}
