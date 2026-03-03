import { useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';

interface LogStreamProps {
  stageFilter?: string;
  onClearStageFilter?: () => void;
}

export function LogStream({ stageFilter, onClearStageFilter }: LogStreamProps) {
  const state = useAppStore((s) => s.state);
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
      if (stageFilter && entry.stage && entry.stage !== stageFilter) return false;
      const matchAction = actionFilter === 'all' || entry.action === actionFilter;
      if (!matchAction) return false;
      if (!query) return true;
      const hay = `${entry.action || ''} ${entry.message || ''}`.toLowerCase();
      return hay.includes(query);
    });
  }, [entries, actionFilter, search, stageFilter]);

  return (
    <section className="panel">
      <h3>Журнал событий</h3>
      <div className="log-toolbar">
        <select value={actionFilter} onChange={(event) => setActionFilter(event.target.value)}>
          <option value="all">Все действия</option>
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
          placeholder="Фильтр по логам..."
        />
        {stageFilter ? (
          <button type="button" className="nav-btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={onClearStageFilter}>
            Этап: {stageFilter} ✕
          </button>
        ) : null}
      </div>
      {filtered.length === 0 ? <p className="muted">Нет подходящих событий</p> : null}
      <ul className="log-list">
        {filtered.map((entry, index) => (
          <li key={`${entry.ts || entry.time || 'n/a'}-${index}`}>
            <span className="log-ts">{entry.ts || entry.time || ''}</span>
            <span className="log-action">{entry.action || 'событие'}</span>
            <span className="log-msg">{entry.message || ''}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
