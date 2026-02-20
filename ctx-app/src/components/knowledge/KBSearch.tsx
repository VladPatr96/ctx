import { useState } from 'react';
import type { ApiClient } from '../../api/client';
import type { KBEntry } from '../../api/types';

interface KBSearchProps {
  client: ApiClient;
}

export function KBSearch({ client }: KBSearchProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState<KBEntry[]>([]);

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
      <h3>KB Search</h3>
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
          placeholder="Search lessons, decisions, errors..."
        />
        <button type="button" onClick={onSearch} disabled={loading}>
          {loading ? 'Searching...' : 'Search'}
        </button>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      <div className="kb-results">
        {entries.map((entry) => (
          <article className="kb-card" key={`${entry.project}-${entry.title}-${entry.created_at || ''}`}>
            <header>
              <strong>{entry.title}</strong>
              <span>{entry.project}</span>
            </header>
            <p>{entry.body.slice(0, 220)}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
