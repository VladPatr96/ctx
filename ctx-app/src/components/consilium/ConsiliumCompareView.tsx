import { useMemo, useState } from 'react';
import type { ConsiliumResult } from '../../api/types';
import ConfidenceGauge from './ConfidenceGauge';

interface ConsiliumCompareViewProps {
  results: ConsiliumResult[];
}

export function ConsiliumCompareView({ results }: ConsiliumCompareViewProps) {
  const groupedByRunId = useMemo(() => {
    const map = new Map<number, ConsiliumResult[]>();

    for (const item of results) {
      if (typeof item.runId !== 'number') continue;
      const current = map.get(item.runId) ?? [];
      current.push(item);
      map.set(item.runId, current);
    }

    return map;
  }, [results]);

  const runIds = useMemo(
    () => Array.from(groupedByRunId.keys()).sort((a, b) => a - b),
    [groupedByRunId]
  );

  const [selectedRunId, setSelectedRunId] = useState<number | null>(
    runIds.length > 0 ? runIds[runIds.length - 1] : null
  );

  const effectiveRunId =
    selectedRunId !== null && groupedByRunId.has(selectedRunId)
      ? selectedRunId
      : runIds.length > 0
        ? runIds[runIds.length - 1]
        : null;

  const selectedResults = useMemo(() => {
    if (effectiveRunId === null) return [];
    return groupedByRunId.get(effectiveRunId) ?? [];
  }, [effectiveRunId, groupedByRunId]);

  const synthesisResult = selectedResults.find(
    (item) => (item.provider ?? '').toLowerCase() === 'synthesis'
  );

  const providerResults = selectedResults.filter(
    (item) => (item.provider ?? '').toLowerCase() !== 'synthesis'
  );

  return (
    <div className="panel" style={{ display: 'grid', gap: 16 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <label htmlFor="consilium-run-filter" style={{ fontWeight: 600 }}>
          Запуск:
        </label>
        <select
          id="consilium-run-filter"
          value={effectiveRunId ?? ''}
          onChange={(event) => setSelectedRunId(Number(event.target.value))}
          disabled={runIds.length === 0}
        >
          {runIds.map((runId) => (
            <option key={runId} value={runId}>
              Запуск #{runId}
            </option>
          ))}
        </select>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: 16,
        }}
      >
        {providerResults.map((item, index) => (
          <article
            key={`${item.provider ?? 'provider'}-${item.runId ?? 'na'}-${index}`}
            className="telemetry-card"
            style={{ display: 'grid', gap: 10, padding: 12 }}
          >
            <header
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                alignItems: 'baseline',
              }}
            >
              <strong>{item.provider ?? 'Неизвестный провайдер'}</strong>
              <span style={{ opacity: 0.8, fontSize: 12 }}>{item.time ?? '-'}</span>
            </header>

            <ConfidenceGauge
              value={item.confidence}
              label="Уверенность"
            />

            <pre
              style={{
                margin: 0,
                whiteSpace: 'pre-wrap',
                maxHeight: 300,
                overflowY: 'auto',
                background: 'var(--surface, #f8fafc)',
                padding: 10,
                borderRadius: 8,
              }}
            >
              {item.result ?? ''}
            </pre>
          </article>
        ))}
      </div>

      {synthesisResult ? (
        <section className="telemetry-card" style={{ padding: 12 }}>
          <header
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'baseline',
              marginBottom: 10,
            }}
          >
            <strong>{synthesisResult.provider ?? 'synthesis'}</strong>
            <span style={{ opacity: 0.8, fontSize: 12 }}>
              {synthesisResult.time ?? '-'}
            </span>
          </header>
          <pre
            style={{
              margin: 0,
              whiteSpace: 'pre-wrap',
              maxHeight: 300,
              overflowY: 'auto',
              background: 'var(--surface, #f8fafc)',
              padding: 10,
              borderRadius: 8,
            }}
          >
            {synthesisResult.result ?? ''}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
