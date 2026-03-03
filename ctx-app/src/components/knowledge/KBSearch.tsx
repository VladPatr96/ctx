import { useState } from 'react';
import type { ApiClient } from '../../api/client';
import type { KBEntry } from '../../api/types';
import { KBDetail } from './KBDetail';

interface KBSearchProps {
  client: ApiClient;
}

export function KBSearch({ client }: KBSearchProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<KBEntry | null>(null);

  const onSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    try {
      const rows = await client.searchKb(q, 10);
      setEntries(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel">
      <h3>Поиск по базе знаний</h3>
      <div className="row">
        <input
          id="kb-search-input"
          type="text"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              void onSearch();
            }
          }}
          placeholder="Поиск уроков, решений, ошибок..."
        />
        <button type="button" onClick={onSearch} disabled={loading}>
          {loading ? 'Поиск...' : 'Найти'}
        </button>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      <div className="kb-results">
        {entries.map((entry) => (
          <article
            className="kb-card"
            key={`${entry.project}-${entry.title}-${entry.created_at || ''}`}
            onClick={() => setSelectedEntry(entry)}
            style={{ cursor: 'pointer' }}
          >
            <header>
              <strong>{entry.title}</strong>
              <span>{entry.project}</span>
            </header>
            <p>{entry.body.slice(0, 220)}</p>
          </article>
        ))}
      </div>
      <KBDetail entry={selectedEntry} onClose={() => setSelectedEntry(null)} />
    </section>
  );
}
