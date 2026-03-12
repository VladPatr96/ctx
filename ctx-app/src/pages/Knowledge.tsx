import { useEffect, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { KBEntry, KBStats, KnowledgeQualitySummary, KnowledgeSuggestionSummary } from '../api/types';
import { KBSearch } from '../components/knowledge/KBSearch';
import { KBEditor } from '../components/knowledge/KBEditor';

interface KnowledgePageProps {
  client: ApiClient;
}

const EMPTY_STATS: KBStats = { total: 0, byCategory: {}, byProject: {} };
const EMPTY_QUALITY: KnowledgeQualitySummary = {
  generatedAt: new Date(0).toISOString(),
  staleAfterDays: 30,
  totals: { totalEntries: 0, totalProjects: 0, snapshotProjects: 0, staleEntries: 0 },
  categoryCoverage: [],
  projects: [],
  gaps: [],
};

export function KnowledgePage({ client }: KnowledgePageProps) {
  const [stats, setStats] = useState<KBStats>(EMPTY_STATS);
  const [quality, setQuality] = useState<KnowledgeQualitySummary>(EMPTY_QUALITY);
  const [suggestions, setSuggestions] = useState<KnowledgeSuggestionSummary | null>(null);
  const [error, setError] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [editingEntry, setEditingEntry] = useState<KBEntry | null>(null);

  useEffect(() => {
    refreshStats();
  }, [client]);

  const refreshStats = () => {
    Promise.all([client.getKbStats(), client.getKbQuality()])
      .then(([statsData, qualityData]) => {
        setStats(statsData);
        setQuality(qualityData);
        setError('');

        const projects = Object.keys(statsData.byProject);
        if (projects.length > 0) {
          client.getKbSuggestions(projects[0]).then(setSuggestions).catch(() => {});
        }
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
          <h3 style={{ margin: 0 }}>Knowledge Base</h3>
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
            {isAdding ? 'Cancel' : '+ Add entry'}
          </button>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
        <p className="metric">Total entries: {stats.total}</p>
        <p className="metric">Projects with snapshots: {quality.totals.snapshotProjects}/{quality.totals.totalProjects}</p>
        <p className="metric">Stale artifacts: {quality.totals.staleEntries}</p>
        <ul className="mini-list">
          {Object.entries(stats.byCategory).map(([name, count]) => (
            <li key={name}>
              <span>{name}</span>
              <span>{count}</span>
            </li>
          ))}
        </ul>
        {quality.gaps.length ? (
          <ul className="mini-list">
            {quality.gaps.slice(0, 3).map((gap) => (
              <li key={`${gap.project}-${gap.type}`}>
                <span>{gap.project}</span>
                <span>{gap.type}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {suggestions && suggestions.suggestions.length > 0 ? (
        <div className="panel" style={{ padding: '12px', marginBottom: '0' }}>
          <h4 style={{ margin: '0 0 8px', fontSize: '13px' }}>Suggestions</h4>
          <div style={{ display: 'grid', gap: '6px' }}>
            {suggestions.suggestions.map((s) => (
              <div
                key={s.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 8px',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                }}
                onClick={() => {
                  setEditingEntry(null);
                  setIsAdding(true);
                }}
              >
                <div>
                  <strong>{s.title}</strong>
                  <div style={{ color: 'var(--muted)', fontSize: '11px', marginTop: '2px' }}>{s.description}</div>
                </div>
                <span style={{
                  fontSize: '10px',
                  padding: '2px 6px',
                  borderRadius: '4px',
                  background: 'var(--primary)',
                  color: 'white',
                  whiteSpace: 'nowrap',
                }}>
                  {s.action.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

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
