import { useEffect, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { AppState, PipelineState } from '../api/types';
import { PipelineBar } from '../components/pipeline/PipelineBar';
import { PipelineGraph } from '../components/pipeline/PipelineGraph';
import { LogStream } from '../components/log/LogStream';

const STAGES = ['detect', 'context', 'task', 'brainstorm', 'plan', 'execute', 'done'];

interface DashboardPageProps {
  client: ApiClient;
  state: AppState | null;
  onRefresh: () => Promise<void>;
}

export function DashboardPage({ client, state, onRefresh }: DashboardPageProps) {
  const [task, setTask] = useState(state?.pipeline?.task || '');
  const [stage, setStage] = useState<PipelineState['stage']>(state?.pipeline?.stage || 'task');
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

  const submitStage = async () => {
    setBusy(true);
    setError('');
    try {
      await client.setStage(stage);
      await onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page-grid">
      <section className="panel">
        <h3>Pipeline</h3>
        <PipelineBar pipeline={state?.pipeline || null} />
        <PipelineGraph pipeline={state?.pipeline || null} />
        <div className="row">
          <input
            id="task-input"
            type="text"
            value={task}
            onChange={(event) => setTask(event.target.value)}
            placeholder="Set task..."
          />
          <button type="button" onClick={submitTask} disabled={busy}>
            Save task
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
          <button type="button" onClick={submitStage} disabled={busy}>
            Set stage
          </button>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <LogStream state={state} />
    </div>
  );
}
