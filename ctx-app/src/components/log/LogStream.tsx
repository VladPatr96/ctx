import { useMemo, useState } from 'react';
import type { AppState } from '../../api/types';

interface LogStreamProps {
  state: AppState | null;
}

export function LogStream({ state }: LogStreamProps) {
  const [actionFilter, setActionFilter] = useState('all');
  const [search, setSearch] = useState('');
  const entries = (state?.log || []).slice(-80).reverse();

  const actions = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((entry) => {
      if (entry.action) set.add(entry.action);
    });
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return entries.filter((entry) => {
      const matchAction = actionFilter === 'all' || entry.action === actionFilter;
      if (!matchAction) return false;
      if (!query) return true;
      const hay = `${entry.action || ''} ${entry.message || ''}`.toLowerCase();
      return hay.includes(query);
    });
  }, [entries, actionFilter, search]);

  return (
    <section className="panel">
      <h3>Live Log</h3>
      <div className="log-toolbar">
        <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
          <option value="all">All actions</option>
          {actions.map((action) => (
            <option value={action} key={action}>
              {action}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Filter logs..."
        />
      </div>
      {filtered.length === 0 ? <p className="muted">No matching events</p> : null}
      <ul className="log-list">
        {filtered.map((entry, index) => (
          <li key={`${entry.ts || entry.time || 'n/a'}-${index}`}>
            <span className="log-ts">{entry.ts || entry.time || ''}</span>
            <span className="log-action">{entry.action || 'event'}</span>
            <span className="log-msg">{entry.message || ''}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
