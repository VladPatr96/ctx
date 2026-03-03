import { useState, useCallback } from 'react';
import type { ApiClient } from '../../api/client';
import type { KBEntry, KBStats } from '../../api/types';
import { KBDetail } from './KBDetail';

interface KBSearchProps {
  client: ApiClient;
  stats: KBStats;
}

export function KBSearch({ client, stats }: KBSearchProps) {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<KBEntry | null>(null);
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [limit, setLimit] = useState(10);

  const onSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    try {
      const rows = await client.searchKb(q, limit);
      // Apply client-side filters
      let filtered = rows;
      if (projectFilter !== 'all') {
        filtered = filtered.filter((entry) => entry.project === projectFilter);
      }
      if (categoryFilter !== 'all') {
        filtered = filtered.filter((entry) => entry.category === categoryFilter);
      }
      setEntries(filtered);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCardClick = useCallback((entry: KBEntry) => {
    setSelectedEntry(entry);
  }, []);

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
      <div className="row">
        <select
          value={projectFilter}
          onChange={(event) => setProjectFilter(event.target.value)}
        >
          <option value="all">Все проекты</option>
          {Object.keys(stats.byProject).map((project) => (
            <option value={project} key={project}>
              {project}
            </option>
          ))}
        </select>
        <select
          value={categoryFilter}
          onChange={(event) => setCategoryFilter(event.target.value)}
        >
          <option value="all">Все категории</option>
          {Object.keys(stats.byCategory).map((category) => (
            <option value={category} key={category}>
              {category}
            </option>
          ))}
        </select>
        <select
          value={limit}
          onChange={(event) => setLimit(Number(event.target.value))}
        >
          <option value={10}>10 результатов</option>
          <option value={25}>25 результатов</option>
          <option value={50}>50 результатов</option>
          <option value={100}>100 результатов</option>
        </select>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      <div className="kb-results">
        {entries.map((entry) => (
          <article
            className="kb-card"
            key={`${entry.project}-${entry.title}-${entry.created_at || ''}`}
            onClick={() => handleCardClick(entry)}
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
