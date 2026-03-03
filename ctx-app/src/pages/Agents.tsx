import { useMemo, useState } from 'react';
import type { ApiClient } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { ConsiliumCompareView } from '../components/consilium/ConsiliumCompareView';

interface AgentsPageProps {
  client: ApiClient;
}

export function AgentsPage({ client }: AgentsPageProps) {
  const state = useAppStore((s) => s.state);
  const [details, setDetails] = useState('');
  const [detailsError, setDetailsError] = useState('');
  const [loadingId, setLoadingId] = useState('');

  const [viewMode, setViewMode] = useState<'list' | 'compare'>('list');

  const agents = state?.agents || [];
  const presets = state?.consilium || [];
  const results = useMemo(() => (state?.results || []).slice().reverse(), [state?.results]);

  const loadDetails = async (agentId: string) => {
    setLoadingId(agentId);
    setDetailsError('');
    try {
      const content = await client.getAgentDetails(agentId);
      setDetails(content);
    } catch (err) {
      setDetails('');
      setDetailsError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingId('');
    }
  };

  return (
    <div className="page-grid">
      <section className="panel">
        <h3>Агенты</h3>
        {agents.length === 0 ? <p className="muted">Нет агентов в текущем состоянии</p> : null}
        <div className="agents-grid">
          {agents.map((agent) => (
            <article className="agent-card" key={agent.id}>
              <div>
                <strong>{agent.name || agent.id}</strong>
                <p className="muted">{agent.role || 'Без роли'}</p>
                <p className="muted">Stage: {agent.stage || '-'}</p>
              </div>
              <button type="button" onClick={() => loadDetails(agent.id)} disabled={loadingId === agent.id}>
                {loadingId === agent.id ? 'Загрузка...' : 'Подробнее'}
              </button>
            </article>
          ))}
        </div>
        {detailsError ? <p className="error-text">{detailsError}</p> : null}
        {details ? <pre className="details-box">{details}</pre> : null}
      </section>

      <section className="panel">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ margin: 0 }}>Консилиум</h3>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              type="button"
              className={`nav-btn${viewMode === 'list' ? ' active' : ''}`}
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setViewMode('list')}
            >
              Список
            </button>
            <button
              type="button"
              className={`nav-btn${viewMode === 'compare' ? ' active' : ''}`}
              style={{ fontSize: 12, padding: '4px 10px' }}
              onClick={() => setViewMode('compare')}
            >
              Сравнение
            </button>
          </div>
        </div>
        <p className="metric">Пресеты: {presets.length}</p>
        <ul className="mini-list">
          {presets.map((preset) => (
            <li key={preset.name}>
              <span>{preset.name}</span>
              <span>{(preset.providers || []).length} провайдеров</span>
            </li>
          ))}
        </ul>

        {viewMode === 'compare' ? (
          <ConsiliumCompareView results={results} />
        ) : (
          <>
            <h4>Последние результаты</h4>
            <div className="result-stream">
              {results.slice(0, 20).map((result, index) => (
                <article className="result-card" key={`${result.provider || 'unknown'}-${index}`}>
                  <header>
                    <strong>{result.provider || 'provider'}</strong>
                    <span>{result.time || ''}</span>
                  </header>
                  <p>{(result.task || 'task').slice(0, 140)}</p>
                  <pre>{(result.result || '').slice(0, 320)}</pre>
                </article>
              ))}
              {results.length === 0 ? <p className="muted">Результатов консилиума пока нет</p> : null}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
