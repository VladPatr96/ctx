import { useMemo, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { AppState } from '../api/types';

interface AgentsPageProps {
  client: ApiClient;
  state: AppState | null;
}

export function AgentsPage({ client, state }: AgentsPageProps) {
  const [details, setDetails] = useState('');
  const [detailsError, setDetailsError] = useState('');
  const [loadingId, setLoadingId] = useState('');

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
        <h3>Agents</h3>
        {agents.length === 0 ? <p className="muted">No agents in current state</p> : null}
        <div className="agents-grid">
          {agents.map((agent) => (
            <article className="agent-card" key={agent.id}>
              <div>
                <strong>{agent.name || agent.id}</strong>
                <p className="muted">{agent.role || 'No role'}</p>
                <p className="muted">Stage: {agent.stage || '-'}</p>
              </div>
              <button type="button" onClick={() => loadDetails(agent.id)} disabled={loadingId === agent.id}>
                {loadingId === agent.id ? 'Loading...' : 'Details'}
              </button>
            </article>
          ))}
        </div>
        {detailsError ? <p className="error-text">{detailsError}</p> : null}
        {details ? <pre className="details-box">{details}</pre> : null}
      </section>

      <section className="panel">
        <h3>Consilium</h3>
        <p className="metric">Presets: {presets.length}</p>
        <ul className="mini-list">
          {presets.map((preset) => (
            <li key={preset.name}>
              <span>{preset.name}</span>
              <span>{(preset.providers || []).length} providers</span>
            </li>
          ))}
        </ul>
        <h4>Latest Results</h4>
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
          {results.length === 0 ? <p className="muted">No consilium results yet</p> : null}
        </div>
      </section>
    </div>
  );
}
