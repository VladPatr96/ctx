import { useEffect, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { KBStats } from '../api/types';
import { KBSearch } from '../components/knowledge/KBSearch';

interface KnowledgePageProps {
  client: ApiClient;
}

const EMPTY_STATS: KBStats = { total: 0, byCategory: {}, byProject: {} };

export function KnowledgePage({ client }: KnowledgePageProps) {
  const [stats, setStats] = useState<KBStats>(EMPTY_STATS);
  const [error, setError] = useState('');

  useEffect(() => {
    client.getKbStats()
      .then((data) => {
        setStats(data);
        setError('');
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
      });
  }, [client]);

  return (
    <div className="page-grid">
      <section className="panel">
        <h3>Knowledge Stats</h3>
        {error ? <p className="error-text">{error}</p> : null}
        <p className="metric">Total entries: {stats.total}</p>
        <ul className="mini-list">
          {Object.entries(stats.byCategory).map(([name, count]) => (
            <li key={name}>
              <span>{name}</span>
              <span>{count}</span>
            </li>
          ))}
        </ul>
      </section>

      <KBSearch client={client} />
    </div>
  );
}
