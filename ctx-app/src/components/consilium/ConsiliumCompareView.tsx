import { useMemo, useState } from 'react';
import type { ConsiliumResult } from '../../api/types';
import ConfidenceGauge from './ConfidenceGauge';
import { Download, LayoutPanelLeft } from 'lucide-react';

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

  const [compareMode, setCompareMode] = useState(false);
  const [compareRunId, setCompareRunId] = useState<number | null>(
    runIds.length > 1 ? runIds[runIds.length - 2] : null
  );

  const effectiveRunId = selectedRunId !== null && groupedByRunId.has(selectedRunId) ? selectedRunId : runIds.length > 0 ? runIds[runIds.length - 1] : null;

  const getResultsForRun = (id: number | null) => {
    if (id === null) return { providerResults: [], synthesisResult: undefined };
    const r = groupedByRunId.get(id) ?? [];
    return {
      providerResults: r.filter(item => (item.provider ?? '').toLowerCase() !== 'synthesis'),
      synthesisResult: r.find(item => (item.provider ?? '').toLowerCase() === 'synthesis')
    };
  };

  const primary = getResultsForRun(effectiveRunId);
  const secondary = compareMode ? getResultsForRun(compareRunId) : null;

  const exportToMarkdown = () => {
    let md = `# Consilium Run #${effectiveRunId}\n\n`;
    for (const item of primary.providerResults) {
      md += `## ${item.provider} (Confidence: ${item.confidence?.toFixed(2) ?? 'N/A'})\n\n`;
      md += `${item.result}\n\n`;
    }
    if (primary.synthesisResult) {
      md += `## Synthesis\n\n${primary.synthesisResult.result}\n\n`;
    }

    if (compareMode && secondary) {
      md += `---\n\n# Compared with Run #${compareRunId}\n\n`;
      for (const item of secondary.providerResults) {
        md += `## ${item.provider} (Confidence: ${item.confidence?.toFixed(2) ?? 'N/A'})\n\n`;
        md += `${item.result}\n\n`;
      }
      if (secondary.synthesisResult) {
        md += `## Synthesis\n\n${secondary.synthesisResult.result}\n\n`;
      }
    }

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `consilium_run_${effectiveRunId}${compareMode ? '_vs_' + compareRunId : ''}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderRun = (runId: number | null, data: typeof primary, titlePrefix: string) => (
    <div style={{ display: 'grid', gap: 16 }}>
      <h4 style={{ margin: 0, color: 'var(--muted)' }}>{titlePrefix} Запуск #{runId}</h4>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
        {data.providerResults.map((item, index) => (
          <article key={`${item.provider}-${item.runId}-${index}`} className="telemetry-card" style={{ display: 'grid', gap: 10, padding: 12 }}>
            <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
              <strong>{item.provider ?? 'Неизвестный провайдер'}</strong>
              <span style={{ opacity: 0.8, fontSize: 12 }}>{item.time ?? '-'}</span>
            </header>
            <ConfidenceGauge value={item.confidence} label="Уверенность" />
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto', background: 'var(--surface)', padding: 10, borderRadius: 8 }}>
              {item.result ?? ''}
            </pre>
          </article>
        ))}
      </div>
      {data.synthesisResult && (
        <section className="telemetry-card" style={{ padding: 12 }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginBottom: 10 }}>
            <strong>{data.synthesisResult.provider ?? 'synthesis'}</strong>
            <span style={{ opacity: 0.8, fontSize: 12 }}>{data.synthesisResult.time ?? '-'}</span>
          </header>
          <pre style={{ margin: 0, whiteSpace: 'pre-wrap', maxHeight: 300, overflowY: 'auto', background: 'var(--surface)', padding: 10, borderRadius: 8 }}>
            {data.synthesisResult.result ?? ''}
          </pre>
        </section>
      )}
    </div>
  );

  return (
    <div className="panel" style={{ display: 'grid', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label htmlFor="consilium-run-filter" style={{ fontWeight: 600, fontSize: 13 }}>Основной запуск:</label>
            <select id="consilium-run-filter" value={effectiveRunId ?? ''} onChange={(e) => setSelectedRunId(Number(e.target.value))} disabled={runIds.length === 0} style={{ padding: '4px 8px', fontSize: 13 }}>
              {runIds.map((rId) => <option key={rId} value={rId}>Запуск #{rId}</option>)}
            </select>
          </div>

          {compareMode && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 16 }}>
              <label htmlFor="consilium-run-compare" style={{ fontWeight: 600, fontSize: 13, color: 'var(--primary)' }}>Сравнить с:</label>
              <select id="consilium-run-compare" value={compareRunId ?? ''} onChange={(e) => setCompareRunId(Number(e.target.value))} disabled={runIds.length < 2} style={{ padding: '4px 8px', fontSize: 13 }}>
                {runIds.filter(r => r !== effectiveRunId).map((rId) => <option key={rId} value={rId}>Запуск #{rId}</option>)}
              </select>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button type="button" onClick={() => setCompareMode(!compareMode)} style={{ display: 'flex', alignItems: 'center', gap: 6, background: compareMode ? 'var(--primary)' : 'transparent', color: compareMode ? 'white' : 'var(--text)', border: compareMode ? '1px solid var(--primary)' : '1px solid var(--border)', fontSize: 12, padding: '6px 10px' }}>
            <LayoutPanelLeft size={14} /> Compare
          </button>
          <button type="button" onClick={exportToMarkdown} disabled={!effectiveRunId} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-alt)', color: 'var(--text)', border: '1px solid var(--border)', fontSize: 12, padding: '6px 10px' }}>
            <Download size={14} /> Export MD
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: compareMode ? 'row' : 'column', gap: 24 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {renderRun(effectiveRunId, primary, compareMode ? 'A:' : '')}
        </div>
        {compareMode && secondary && (
          <div style={{ flex: 1, minWidth: 0, paddingLeft: 24, borderLeft: '1px solid var(--border)' }}>
            {renderRun(compareRunId, secondary, 'B:')}
          </div>
        )}
      </div>
    </div>
  );
}
