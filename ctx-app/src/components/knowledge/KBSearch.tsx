import { useEffect, useState, useCallback } from 'react';
import type { ApiClient } from '../../api/client';
import type { KBEntry, KBStats, KnowledgeContinuityDigest, KnowledgeProjectExport, KnowledgeSuggestionSummary } from '../../api/types';
import { KBDetail } from './KBDetail';

interface KBSearchProps {
  client: ApiClient;
  stats: KBStats;
  onEdit?: (entry: KBEntry) => void;
}

function readKnowledgeNavigationParams() {
  if (typeof window === 'undefined') {
    return {
      query: '',
      project: 'all',
      focusId: null as number | null,
    };
  }

  const params = new URLSearchParams(window.location.search);
  const query = params.get('kb_query')?.trim() || '';
  const project = params.get('kb_project')?.trim() || 'all';
  const rawFocusId = params.get('kb_focus');
  const parsedFocusId = rawFocusId ? Number.parseInt(rawFocusId, 10) : Number.NaN;

  return {
    query,
    project: project || 'all',
    focusId: Number.isFinite(parsedFocusId) ? parsedFocusId : null,
  };
}

export function KBSearch({ client, stats, onEdit }: KBSearchProps) {
  const [navigationParams] = useState(() => readKnowledgeNavigationParams());
  const [query, setQuery] = useState(() => navigationParams.query);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState<KBEntry[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<KBEntry | null>(null);
  const [projectFilter, setProjectFilter] = useState<string>(() => navigationParams.project);
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [limit, setLimit] = useState(10);
  const [continuity, setContinuity] = useState<KnowledgeContinuityDigest | null>(null);
  const [projectExport, setProjectExport] = useState<KnowledgeProjectExport | null>(null);
  const [suggestions, setSuggestions] = useState<KnowledgeSuggestionSummary | null>(null);
  const [pendingFocusId] = useState<number | null>(() => navigationParams.focusId);

  const onSearch = async () => {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    setError('');
    try {
      const rows = await client.searchKb(
        q,
        limit,
        projectFilter !== 'all' ? projectFilter : undefined
      );
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

  useEffect(() => {
    let cancelled = false;

    async function loadContinuity() {
      if (projectFilter === 'all') {
        setContinuity(null);
        setProjectExport(null);
        setSuggestions(null);
        return;
      }

      try {
        const [digest, exportArtifact, suggestionSummary] = await Promise.all([
          client.getKbContinuity(projectFilter, 5),
          client.getKbExport(projectFilter, 5),
          client.getKbSuggestions(projectFilter, 5),
        ]);
        if (!cancelled) {
          setContinuity(digest);
          setProjectExport(exportArtifact);
          setSuggestions(suggestionSummary);
        }
      } catch {
        if (!cancelled) {
          setContinuity(null);
          setProjectExport(null);
          setSuggestions(null);
        }
      }
    }

    void loadContinuity();

    return () => {
      cancelled = true;
    };
  }, [client, projectFilter]);

  useEffect(() => {
    if (!navigationParams.query.trim()) return;
    void onSearch();
  }, [client]);

  useEffect(() => {
    if (pendingFocusId === null) return;
    const match = entries.find((entry) => entry.id === pendingFocusId);
    if (match) {
      setSelectedEntry(match);
    }
  }, [entries, pendingFocusId]);

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
      {continuity ? (
        <section className="panel-subsection">
          <header className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <strong>Continuity</strong>
            <span>{continuity.stats.totalEntries} artifacts</span>
          </header>
          <p>
            {continuity.snapshot.exists
              ? `Snapshot: ${continuity.snapshot.task || 'latest task'}`
              : 'No snapshot yet for this project.'}
          </p>
          {continuity.snapshot.branch ? <p>Branch: {continuity.snapshot.branch}</p> : null}
          {projectExport ? (
            <p>
              Export health: {projectExport.quality.totalEntries} entries, {projectExport.quality.staleEntries} stale,
              {` ${projectExport.quality.categories.length} categories`}
            </p>
          ) : null}
          {continuity.suggestions.length ? (
            <div className="kb-results">
              {continuity.suggestions.map((suggestion, index) => (
                <article className="kb-card" key={`${suggestion.type}-${suggestion.entryId || index}`}>
                  <header>
                    <strong>{suggestion.title}</strong>
                    <span>{suggestion.type}</span>
                  </header>
                  <p>{suggestion.description}</p>
                </article>
              ))}
            </div>
          ) : null}
          {projectExport?.sections.length ? (
            <div className="kb-results">
              {projectExport.sections.map((section) => (
                <article className="kb-card" key={section.category}>
                  <header>
                    <strong>{section.category}</strong>
                    <span>{section.count}</span>
                  </header>
                  <p>{section.entries.slice(0, 2).map((entry) => entry.title).join(' | ') || 'No entries'}</p>
                </article>
              ))}
            </div>
          ) : null}
          {suggestions?.suggestions.length ? (
            <div className="kb-results">
              {suggestions.suggestions.map((suggestion) => (
                <article className="kb-card" key={suggestion.id}>
                  <header>
                    <strong>{suggestion.title}</strong>
                    <span>{suggestion.action}</span>
                  </header>
                  <p>{suggestion.description}</p>
                </article>
              ))}
            </div>
          ) : null}
          {suggestions?.templates.length ? (
            <div className="kb-results">
              {suggestions.templates.map((template) => (
                <article className="kb-card" key={template.id}>
                  <header>
                    <strong>{template.title}</strong>
                    <span>{template.sourceCategories.join(', ')}</span>
                  </header>
                  <p>{template.prompt}</p>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
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
            {entry.retrieval?.matchReason ? <p><small>{entry.retrieval.matchReason}</small></p> : null}
            <p>{entry.body.slice(0, 220)}</p>
          </article>
        ))}
      </div>
      <KBDetail entry={selectedEntry} onClose={() => setSelectedEntry(null)} onEdit={onEdit} />
    </section>
  );
}
