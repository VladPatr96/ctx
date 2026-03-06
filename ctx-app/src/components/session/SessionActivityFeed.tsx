import { useMemo, useState } from 'react';
import { useAppStore } from '../../store/useAppStore';

interface SessionActivityFeedProps {
  limit?: number;
  showFilters?: boolean;
  standalone?: boolean;
}

export function SessionActivityFeed({ limit = 50, showFilters = true, standalone = true }: SessionActivityFeedProps) {
  const state = useAppStore((s) => s.state);
  const [stageFilter, setStageFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [search, setSearch] = useState('');
  const entries = (state?.log || []).slice(-100).reverse();

  const stages = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((entry) => {
      if (entry.stage) set.add(entry.stage);
    });
    return Array.from(set).sort();
  }, [entries]);

  const actions = useMemo(() => {
    const set = new Set<string>();
    entries.forEach((entry) => {
      if (entry.action) set.add(entry.action);
    });
    return Array.from(set).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    let result = entries.filter((entry) => {
      const matchStage = stageFilter === 'all' || entry.stage === stageFilter;
      const matchAction = actionFilter === 'all' || entry.action === actionFilter;
      if (!matchStage || !matchAction) return false;
      if (!query) return true;
      const hay = `${entry.action || ''} ${entry.message || ''} ${entry.stage || ''}`.toLowerCase();
      return hay.includes(query);
    });
    return result.slice(0, limit);
  }, [entries, stageFilter, actionFilter, search, limit]);

  const handleClearFilters = () => {
    setStageFilter('all');
    setActionFilter('all');
    setSearch('');
  };

  const hasActiveFilters = stageFilter !== 'all' || actionFilter !== 'all' || search.trim() !== '';

  const ComponentName = standalone ? 'section' : 'div';

  return (
    <ComponentName className={standalone ? "panel" : ""}>
      {standalone && <h3>Активность сессии</h3>}
      {showFilters ? (
        <div className="log-toolbar">
          <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
            <option value="all">Все этапы</option>
            {stages.map((stage) => (
              <option value={stage} key={stage}>
                {stage}
              </option>
            ))}
          </select>
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
            placeholder="Поиск по активности..."
          />
          {hasActiveFilters ? (
            <button type="button" className="nav-btn" style={{ fontSize: 11, padding: '4px 8px' }} onClick={handleClearFilters}>
              Очистить фильтры ✕
            </button>
          ) : null}
        </div>
      ) : null}
      {filtered.length === 0 ? <p className="muted">Нет активности для отображения</p> : null}
      <ul className="log-list session-activity-list">
        {filtered.map((entry, index) => (
          <li key={`${entry.ts || entry.time || 'n/a'}-${index}`}>
            <span className="log-ts">{entry.ts || entry.time || ''}</span>
            <span className="log-stage">{entry.stage || '-'}</span>
            <span className="log-action">{entry.action || 'событие'}</span>
            <span className="log-msg">{entry.message || ''}</span>
          </li>
        ))}
      </ul>
    </ComponentName>
  );
}
