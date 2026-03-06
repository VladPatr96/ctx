import { useCallback, useEffect, useState } from 'react';
import type { ApiClient, DevPipelineReport, DevPipelineSpec } from '../api/client';

const PROVIDERS = ['claude', 'gemini', 'codex', 'opencode'] as const;

const PHASE_LABELS: Record<string, string> = {
  INIT: 'Init',
  EXECUTE: 'Execute',
  SORT: 'Sort',
  MERGE: 'Merge',
  VERIFY: 'Verify',
  FINALIZE: 'Finalize',
  CLEANUP: 'Cleanup',
};

const ALL_PHASES = Object.keys(PHASE_LABELS);

function emptySpec(): DevPipelineSpec {
  return { agentId: '', task: '', provider: 'claude', priority: 0 };
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const s = (ms / 1000).toFixed(1);
  return `${s}s`;
}

function getPhaseState(report: DevPipelineReport, phase: string): 'done' | 'active' | 'failed' | 'pending' {
  if (report.status === 'success') return 'done';
  if (report.status === 'failed' || report.status === 'error') {
    const phaseIdx = ALL_PHASES.indexOf(phase);
    const failedPhaseIdx = inferFailedPhase(report);
    if (phaseIdx < failedPhaseIdx) return 'done';
    if (phaseIdx === failedPhaseIdx) return 'failed';
    return 'pending';
  }
  // running
  const activeIdx = inferActivePhase(report);
  const phaseIdx = ALL_PHASES.indexOf(phase);
  if (phaseIdx < activeIdx) return 'done';
  if (phaseIdx === activeIdx) return 'active';
  return 'pending';
}

function inferActivePhase(r: DevPipelineReport): number {
  if (r.phases.verify) return 5; // FINALIZE or later
  if (r.phases.merges.length > 0) return 3; // MERGE
  if (r.phases.execute) return 2; // SORT
  return 0;
}

function inferFailedPhase(r: DevPipelineReport): number {
  if (r.error?.includes('Integration tests')) return 4;
  if (r.error?.includes('Fast-forward')) return 5;
  if (r.phases.merges.length > 0) return 3;
  if (r.phases.execute && r.summary.executed === 0) return 1;
  return 0;
}

interface DevPipelinePageProps {
  client: ApiClient;
}

export function DevPipelinePage({ client }: DevPipelinePageProps) {
  const [specs, setSpecs] = useState<DevPipelineSpec[]>([emptySpec(), emptySpec()]);
  const [baseBranch, setBaseBranch] = useState('master');
  const [testCommand, setTestCommand] = useState('');
  const [stopOnTestFail, setStopOnTestFail] = useState(false);
  const [conflictResolution, setConflictResolution] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [pipelines, setPipelines] = useState<DevPipelineReport[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchPipelines = useCallback(async () => {
    try {
      const result = await client.devPipelineStatus();
      const list = Array.isArray(result) ? result : [result];
      setPipelines(list.sort((a, b) => b.startedAt.localeCompare(a.startedAt)));
    } catch {
      // pipelines might not exist yet
    }
  }, [client]);

  useEffect(() => {
    fetchPipelines();
  }, [fetchPipelines]);

  const updateSpec = (idx: number, patch: Partial<DevPipelineSpec>) => {
    setSpecs((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };

  const addSpec = () => {
    if (specs.length >= 6) return;
    setSpecs((prev) => [...prev, emptySpec()]);
  };

  const removeSpec = (idx: number) => {
    if (specs.length <= 1) return;
    setSpecs((prev) => prev.filter((_, i) => i !== idx));
  };

  const launch = async () => {
    const valid = specs.filter((s) => s.agentId.trim() && s.task.trim());
    if (valid.length === 0) {
      setError('Добавьте хотя бы одного агента с ID и задачей');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await client.devPipelineRun(valid, {
        baseBranch: baseBranch || undefined,
        testCommand: testCommand.trim() || undefined,
        stopOnTestFail,
        conflictResolution,
      });
      await fetchPipelines();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-grid">
      {/* Launch Form */}
      <section className="panel">
        <h3>Запуск Dev Pipeline</h3>
        <p className="muted" style={{ fontSize: 12, margin: '0 0 10px' }}>
          Параллельное выполнение агентов с автоматическим merge и тестами
        </p>

        <div className="dp-form-grid">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: 12 }}>Агенты</strong>
            <button type="button" className="dp-add-btn" onClick={addSpec} disabled={specs.length >= 6}>
              + Добавить
            </button>
          </div>

          {specs.map((spec, idx) => (
            <div className="dp-spec-row" key={idx}>
              <input
                type="text"
                placeholder="agent-id"
                value={spec.agentId}
                onChange={(e) => updateSpec(idx, { agentId: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
              />
              <input
                type="text"
                placeholder="Задача для агента..."
                value={spec.task}
                onChange={(e) => updateSpec(idx, { task: e.target.value })}
              />
              <select value={spec.provider} onChange={(e) => updateSpec(idx, { provider: e.target.value })}>
                {PROVIDERS.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                max={99}
                value={spec.priority ?? 0}
                title="Приоритет (0 = наивысший)"
                onChange={(e) => updateSpec(idx, { priority: Number(e.target.value) })}
              />
              <button type="button" className="dp-remove-btn" onClick={() => removeSpec(idx)} disabled={specs.length <= 1}>
                ✕
              </button>
            </div>
          ))}
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <input
            type="text"
            placeholder="Base branch (master)"
            value={baseBranch}
            onChange={(e) => setBaseBranch(e.target.value)}
            style={{ flex: '0 0 140px' }}
          />
          <input
            type="text"
            placeholder="Test command (npm test)"
            value={testCommand}
            onChange={(e) => setTestCommand(e.target.value)}
          />
        </div>

        <div className="row" style={{ fontSize: 12 }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
            <input
              type="checkbox"
              checked={stopOnTestFail}
              onChange={(e) => setStopOnTestFail(e.target.checked)}
              style={{ flex: 'none', width: 'auto' }}
            />
            Stop on fail
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
            <input
              type="checkbox"
              checked={conflictResolution}
              onChange={(e) => setConflictResolution(e.target.checked)}
              style={{ flex: 'none', width: 'auto' }}
            />
            AI Conflict Resolution
          </label>
        </div>

        <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
          <button type="button" className="dp-launch-btn" onClick={launch} disabled={busy}>
            {busy ? 'Запуск...' : 'Запустить Pipeline'}
          </button>
          <button type="button" onClick={fetchPipelines} style={{ fontSize: 12, flex: 'none' }}>
            Обновить
          </button>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
      </section>

      {/* Pipelines List */}
      <section className="panel">
        <h3>Pipelines</h3>
        {pipelines.length === 0 ? (
          <p className="muted">Нет запусков</p>
        ) : (
          <div className="dp-pipelines-list">
            {pipelines.map((pl) => (
              <PipelineCard
                key={pl.pipelineId}
                report={pl}
                expanded={expandedId === pl.pipelineId}
                onToggle={() => setExpandedId((prev) => (prev === pl.pipelineId ? null : pl.pipelineId))}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function PipelineCard({ report, expanded, onToggle }: { report: DevPipelineReport; expanded: boolean; onToggle: () => void }) {
  const s = report.summary;

  return (
    <article className="dp-pipeline-card">
      <header>
        <strong
          style={{ cursor: 'pointer' }}
          onClick={onToggle}
          title="Развернуть/свернуть"
        >
          {report.pipelineId}
        </strong>
        <span className={`dp-status-badge ${report.status}`}>{report.status}</span>
      </header>

      <div className="dp-summary-row">
        <div className="dp-summary-item">
          <span className="label">Агентов:</span>
          <span className="value">{s.total}</span>
        </div>
        <div className="dp-summary-item">
          <span className="label">Выполнено:</span>
          <span className="value">{s.executed}</span>
        </div>
        <div className="dp-summary-item">
          <span className="label">Merged:</span>
          <span className="value" style={{ color: s.merged > 0 ? 'var(--success)' : undefined }}>{s.merged}</span>
        </div>
        <div className="dp-summary-item">
          <span className="label">Skip:</span>
          <span className="value" style={{ color: s.skipped > 0 ? 'var(--warning)' : undefined }}>{s.skipped}</span>
        </div>
        {report.durationMs > 0 ? (
          <div className="dp-summary-item">
            <span className="label">Время:</span>
            <span className="value">{formatDuration(report.durationMs)}</span>
          </div>
        ) : null}
      </div>

      {/* Phase pills */}
      <div className="dp-phases">
        {ALL_PHASES.map((phase) => {
          const st = getPhaseState(report, phase);
          return (
            <span key={phase} className={`dp-phase-pill ${st}`}>
              {PHASE_LABELS[phase]}
            </span>
          );
        })}
      </div>

      {report.error ? (
        <p className="error-text" style={{ marginTop: 8 }}>{report.error}</p>
      ) : null}

      {/* Expanded details */}
      {expanded ? (
        <div style={{ marginTop: 10 }}>
          <strong style={{ fontSize: 12 }}>Агенты</strong>
          <div className="dp-agents-grid">
            {Object.entries(report.agents).map(([agentId, data]) => (
              <div key={agentId} className="dp-agent-row">
                <span className="agent-name">{agentId}</span>
                <span style={{ color: data.execution?.status === 'success' ? 'var(--success)' : 'var(--danger)' }}>
                  {data.execution?.status || '-'}
                </span>
                <span>
                  {data.merge?.success ? (data.merge.reverted ? 'reverted' : 'merged') : data.merge ? 'conflict' : '-'}
                </span>
                <span className="muted">
                  {data.tests?.success ? 'tests ok' : data.tests?.skipped ? 'no tests' : data.tests ? 'tests fail' : ''}
                </span>
              </div>
            ))}
          </div>

          {report.startedAt ? (
            <p className="muted" style={{ fontSize: 11, marginTop: 8 }}>
              Старт: {new Date(report.startedAt).toLocaleString()}
              {report.completedAt ? ` — Конец: ${new Date(report.completedAt).toLocaleString()}` : ''}
            </p>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
