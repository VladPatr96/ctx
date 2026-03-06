import { useCallback, useEffect, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { PipelineState } from '../api/types';
import { useAppStore } from '../store/useAppStore';
import { PipelineBar } from '../components/pipeline/PipelineBar';
import { PipelineGraph } from '../components/pipeline/PipelineGraph';
import { StageDetailPanel } from '../components/pipeline/StageDetailPanel';
import { LogStream } from '../components/log/LogStream';
import { CostDashboard } from '../components/cost/CostDashboard';

const STAGES = ['detect', 'context', 'task', 'brainstorm', 'plan', 'execute', 'done'];

interface DashboardPageProps {
  client: ApiClient;
  onRefresh: () => Promise<void>;
}

export function DashboardPage({ client, onRefresh }: DashboardPageProps) {
  const state = useAppStore((s) => s.state);
  const [task, setTask] = useState(state?.pipeline?.task || '');
  const [stage, setStage] = useState<PipelineState['stage']>(state?.pipeline?.stage || 'task');
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTask(state?.pipeline?.task || '');
    setStage(state?.pipeline?.stage || 'task');
  }, [state?.pipeline?.task, state?.pipeline?.stage]);

  const submitTask = async () => {
    const nextTask = task.trim();
    if (!nextTask) return;
    setBusy(true);
    setError('');
    try {
      await client.setTask(nextTask);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const submitStage = async (targetStage?: string) => {
    const stageToSet = targetStage || stage;
    setBusy(true);
    setError('');
    try {
      await client.setStage(stageToSet);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleStageClick = useCallback((stageName: string) => {
    setSelectedStage((prev) => (prev === stageName ? null : stageName));
  }, []);

  return (
    <div className="page-grid">
      <section className="panel">
        <h3>Пайплайн</h3>
        <PipelineBar pipeline={state?.pipeline || null} />
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <PipelineGraph pipeline={state?.pipeline || null} onStageClick={handleStageClick} />
          </div>
          <StageDetailPanel
            stage={selectedStage}
            pipeline={state?.pipeline || null}
            onSetStage={(s) => submitStage(s)}
            onClose={() => setSelectedStage(null)}
          />
        </div>
        <div className="row">
          <input
            id="task-input"
            type="text"
            value={task}
            onChange={(event) => setTask(event.target.value)}
            placeholder="Введите задачу..."
          />
          <button type="button" onClick={() => submitTask()} disabled={busy}>
            Сохранить
          </button>
        </div>
        <div className="row">
          <select
            value={stage}
            onChange={(event) => setStage(event.target.value as PipelineState['stage'])}
          >
            {STAGES.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => submitStage()} disabled={busy}>
            Установить этап
          </button>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <CostDashboard client={client} />

      <LogStream stageFilter={selectedStage || undefined} onClearStageFilter={() => setSelectedStage(null)} />
    </div>
  );
}
