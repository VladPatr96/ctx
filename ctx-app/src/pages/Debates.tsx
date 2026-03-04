import { useCallback, useState } from 'react';
import type { ApiClient } from '../api/client';
import { useAppStore } from '../store/useAppStore';
import { ConsiliumCompareView } from '../components/consilium/ConsiliumCompareView';
import { ClaimGraphExplorer } from '../components/claims/ClaimGraphExplorer';

interface DebatesPageProps {
  client: ApiClient;
}

export function DebatesPage({ client }: DebatesPageProps) {
  const state = useAppStore((s) => s.state);
  const results = state?.results ?? [];
  const claimGraph = (state as Record<string, unknown> | null)?.claimGraph as
    | import('../api/types').ClaimGraphData
    | null
    | undefined;

  const [resynthesizing, setResynthesizing] = useState(false);

  const handleVerdictChange = useCallback(
    async (claimId: string, verdict: 'true' | 'false' | null) => {
      setResynthesizing(true);
      try {
        await client.setClaimVerdict(claimId, verdict);
      } catch (err) {
        console.error('Failed to set verdict:', err);
      } finally {
        setResynthesizing(false);
      }
    },
    [client],
  );

  const hasResults = results.length > 0;
  const hasClaimGraph = claimGraph && claimGraph.stats.total > 0;

  if (!hasResults && !hasClaimGraph) {
    return (
      <div className="panel" style={{ textAlign: 'center', padding: 40, color: 'var(--muted)' }}>
        <p style={{ fontSize: 14 }}>
          Запустите multi-round consilium для отображения графа
        </p>
        <p style={{ fontSize: 12, marginTop: 8 }}>
          Используйте инструмент <code>ctx_consilium_multi_round</code> с параметрами{' '}
          <code>enableClaimExtraction</code> и <code>enableSmartSynthesis</code>
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      {/* Provider comparison */}
      {hasResults && (
        <section>
          <h3 style={{ margin: '0 0 8px' }}>Ответы провайдеров</h3>
          <ConsiliumCompareView results={results} />
        </section>
      )}

      {/* Claim graph */}
      {hasClaimGraph ? (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Граф утверждений</h3>
            {resynthesizing && (
              <span style={{ fontSize: 12, color: 'var(--warning)' }}>
                Пересинтез...
              </span>
            )}
          </div>
          <div className="panel">
            <ClaimGraphExplorer data={claimGraph} onVerdictChange={handleVerdictChange} />
          </div>
        </section>
      ) : hasResults ? (
        <div className="panel" style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>
          <p style={{ fontSize: 13, margin: 0 }}>
            Граф утверждений недоступен. Включите <code>enableClaimExtraction</code> и{' '}
            <code>enableSmartSynthesis</code> для построения графа.
          </p>
        </div>
      ) : null}
    </div>
  );
}
