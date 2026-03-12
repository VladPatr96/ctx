import { useCallback, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { ConsiliumPreset } from '../api/types';
import { useAppStore } from '../store/useAppStore';
import { ConsiliumCompareView } from '../components/consilium/ConsiliumCompareView';
import { ConsiliumObservabilityPanel } from '../components/consilium/ConsiliumObservabilityPanel';
import { ConsiliumReplayPanel } from '../components/consilium/ConsiliumReplayPanel';
import { ClaimGraphExplorer } from '../components/claims/ClaimGraphExplorer';

interface DebatesPageProps {
  client: ApiClient;
}

function ConsiliumLauncher({ client, presets }: { client: ApiClient; presets: ConsiliumPreset[] }) {
  const [selectedPreset, setSelectedPreset] = useState(presets[0]?.name || '');
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState('');

  const handleLaunch = async () => {
    setLaunching(true);
    setLaunchError('');
    try {
      await client.activateConsiliumPreset(selectedPreset || undefined);
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : String(err));
    } finally {
      setLaunching(false);
    }
  };

  return (
    <div className="panel" style={{ textAlign: 'center', padding: 40 }}>
      <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 16 }}>
        Launch a multi-round consilium for live observability and claim graph data.
      </p>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', alignItems: 'center', flexWrap: 'wrap' }}>
        {presets.length > 0 ? (
          <select
            value={selectedPreset}
            onChange={(e) => setSelectedPreset(e.target.value)}
            style={{ fontSize: 13, padding: '6px 10px' }}
          >
            {presets.map((p) => (
              <option key={p.name} value={p.name}>
                {p.name}{p.description ? ` — ${p.description}` : ''}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          onClick={() => void handleLaunch()}
          disabled={launching}
          style={{ fontSize: 13, padding: '6px 14px' }}
        >
          {launching ? 'Starting consilium...' : 'Run Consilium'}
        </button>
      </div>
      {launchError ? <p style={{ color: 'var(--danger, #e53e3e)', fontSize: 12, marginTop: 8 }}>{launchError}</p> : null}
    </div>
  );
}

export function DebatesPage({ client }: DebatesPageProps) {
  const state = useAppStore((s) => s.state);
  const results = state?.results ?? [];
  const claimGraph = (state as Record<string, unknown> | null)?.claimGraph as
    | import('../api/types').ClaimGraphData
    | null
    | undefined;
  const observability = (state as Record<string, unknown> | null)?.consiliumObservability as
    | import('../api/types').ConsiliumObservability
    | null
    | undefined;
  const projectRecord = (state as Record<string, unknown> | null)?.project as
    | Record<string, unknown>
    | null
    | undefined;
  const projectName = typeof projectRecord?.name === 'string' ? projectRecord.name : null;

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

  return (
    <div style={{ display: 'grid', gap: 16 }}>
      <section>
        <h3 style={{ margin: '0 0 8px' }}>Decision Archive</h3>
        <ConsiliumReplayPanel client={client} project={projectName} />
      </section>

      {observability ? (
        <section>
          <h3 style={{ margin: '0 0 8px' }}>Observability</h3>
          <ConsiliumObservabilityPanel observability={observability} />
        </section>
      ) : null}

      {hasResults ? (
        <section>
          <h3 style={{ margin: '0 0 8px' }}>Provider Responses</h3>
          <ConsiliumCompareView results={results} />
        </section>
      ) : null}

      {hasClaimGraph ? (
        <section>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <h3 style={{ margin: 0 }}>Claim Graph</h3>
            {resynthesizing ? (
              <span style={{ fontSize: 12, color: 'var(--warning)' }}>
                resynthesizing...
              </span>
            ) : null}
          </div>
          <div className="panel">
            <ClaimGraphExplorer data={claimGraph} onVerdictChange={handleVerdictChange} />
          </div>
        </section>
      ) : hasResults ? (
        <div className="panel" style={{ textAlign: 'center', padding: 20, color: 'var(--muted)' }}>
          <p style={{ fontSize: 13, margin: 0 }}>
            Claim graph unavailable. Enable <code>enableClaimExtraction</code> and{' '}
            <code>enableSmartSynthesis</code> for graph generation.
          </p>
        </div>
      ) : null}

      {!hasResults && !hasClaimGraph && !observability ? (
        <ConsiliumLauncher client={client} presets={state?.consilium ?? []} />
      ) : null}
    </div>
  );
}
