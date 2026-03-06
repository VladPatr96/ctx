import { useCallback, useEffect, useState } from 'react';
import type { ApiClient } from '../api/client';
import type { PipelineState } from '../api/types';
import { useAppStore } from '../store/useAppStore';
import { PipelineBar } from '../components/pipeline/PipelineBar';
import { PipelineGraph } from '../components/pipeline/PipelineGraph';
import { StageDetailPanel } from '../components/pipeline/StageDetailPanel';
import { CombinedLogView } from '../components/log/CombinedLogView';
import { AgentActivityWidget } from '../components/dashboard/AgentActivityWidget';
import { CostAnalyticsWidget } from '../components/dashboard/CostAnalyticsWidget';
import { TaskCompareModal } from '../components/dashboard/TaskCompareModal';

const STAGES = ['detect', 'context', 'task', 'brainstorm', 'plan', 'execute', 'done'];

interface DashboardPageProps {
  client: ApiClient;
  onRefresh: () => Promise<void>;
}

interface TaskVersion {
  id: string;
  task: string;
  provider: string;
  timestamp: string;
  edited: boolean;
}

export function DashboardPage({ client, onRefresh }: DashboardPageProps) {
  const state = useAppStore((s) => s.state);
  const [task, setTask] = useState(state?.pipeline?.task || '');
  const [taskHistory, setTaskHistory] = useState<TaskVersion[]>([]);
  const [stage, setStage] = useState<PipelineState['stage']>(state?.pipeline?.stage || 'task');
  const [selectedStage, setSelectedStage] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [comparingVersion, setComparingVersion] = useState<TaskVersion | null>(null);

  useEffect(() => {
    setTask(state?.pipeline?.task || '');
    setStage(state?.pipeline?.stage || 'task');

    // Auto-populate the initial history state with whatever the current remote task is
    if (state?.pipeline?.task) {
      setTaskHistory(prev => {
        if (prev.length === 0 || prev[0].task !== state.pipeline?.task) {
          return [{
            id: 'init-' + Date.now(),
            task: state.pipeline?.task || '',
            provider: state.pipeline?.lead || 'system',
            timestamp: new Date().toLocaleTimeString(),
            edited: false
          }, ...prev];
        }
        return prev;
      });
    }
  }, [state?.pipeline?.task, state?.pipeline?.stage, state?.pipeline?.lead]);

  const submitTask = async () => {
    const nextTask = task.trim();
    if (!nextTask) return;
    setBusy(true);
    setError('');
    try {
      await client.setTask(nextTask);

      setTaskHistory(prev => {
        if (prev.length > 0 && prev[0].task === nextTask) return prev;
        return [{
          id: Date.now().toString(),
          task: nextTask,
          provider: state?.pipeline?.lead || 'user',
          timestamp: new Date().toLocaleTimeString(),
          edited: task !== state?.pipeline?.task
        }, ...prev];
      });

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

  const [playbackIndex, setPlaybackIndex] = useState<number | null>(null);
  const activeStageIndex = STAGES.indexOf((state?.pipeline?.stage || 'task').toLowerCase());

  const displayPipeline = playbackIndex !== null && state?.pipeline ? {
    ...state.pipeline,
    stage: STAGES[playbackIndex] as PipelineState['stage']
  } : (state?.pipeline || null);

  return (
    <div className="page-grid">
      <section className="panel">
        <h3>Пайплайн</h3>
        <PipelineBar pipeline={displayPipeline} />
        <div style={{ display: 'flex', gap: 16 }}>
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
            <PipelineGraph pipeline={displayPipeline} onStageClick={handleStageClick} />

            <div style={{ marginTop: '16px', display: 'flex', alignItems: 'center', gap: '12px', background: 'var(--surface-alt)', padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <span style={{ fontSize: '11px', color: 'var(--muted)', fontWeight: 'bold', textTransform: 'uppercase' }}>TIMELINE:</span>
              <input
                type="range"
                min="0"
                max={Math.max(0, STAGES.length - 1)}
                value={playbackIndex !== null ? playbackIndex : Math.max(0, activeStageIndex)}
                onChange={(e) => setPlaybackIndex(Number(e.target.value))}
                style={{ flex: 1, accentColor: 'var(--primary)' }}
                title={`Этап ${Math.max(1, playbackIndex !== null ? playbackIndex + 1 : activeStageIndex + 1)} из ${STAGES.length}: ${STAGES[playbackIndex !== null ? playbackIndex : Math.max(0, activeStageIndex)].toUpperCase()}`}
              />
              <button
                type="button"
                onClick={() => setPlaybackIndex(null)}
                disabled={playbackIndex === null}
                style={{ padding: '4px 10px', fontSize: '11px', background: playbackIndex === null ? 'transparent' : 'var(--primary)', color: playbackIndex === null ? 'var(--muted)' : 'white', border: playbackIndex === null ? '1px solid var(--border)' : '1px solid var(--primary)' }}
              >
                Live
              </button>
            </div>
          </div>
          <StageDetailPanel
            stage={selectedStage}
            pipeline={displayPipeline}
            onSetStage={(s) => submitStage(s)}
            onClose={() => setSelectedStage(null)}
          />
        </div>
        <div className="row" style={{ marginTop: '16px' }}>
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

        {taskHistory.length > 0 && (
          <div style={{ padding: '8px 12px', background: 'var(--surface-alt)', borderRadius: '8px', border: '1px solid var(--border)', marginBottom: '8px' }}>
            <h4 style={{ margin: '0 0 8px 0', fontSize: '11px', color: 'var(--muted)', textTransform: 'uppercase' }}>Версии плана</h4>
            <div style={{ display: 'grid', gap: '6px' }}>
              {taskHistory.map((version, idx) => (
                <div key={version.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', paddingBottom: idx === taskHistory.length - 1 ? 0 : '6px', borderBottom: idx === taskHistory.length - 1 ? 'none' : '1px solid var(--border-soft)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                    <span style={{ color: idx === 0 ? 'var(--primary)' : 'var(--muted)', whiteSpace: 'nowrap', fontWeight: idx === 0 ? 'bold' : 'normal' }}>
                      {idx === 0 ? '[v' + taskHistory.length + ' ТЕКУЩАЯ]' : `[v${taskHistory.length - idx}]`}
                    </span>
                    <span style={{ color: 'var(--muted)' }}>
                      ← {version.provider}, {version.timestamp} {version.edited ? '📝' : ''}
                    </span>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px', color: 'var(--text)' }} title={version.task}>
                      {version.task}
                    </span>
                  </div>
                  {idx !== 0 && (
                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => setComparingVersion(version)}
                        style={{ padding: '2px 8px', fontSize: '11px', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)' }}
                      >
                        Compare
                      </button>
                      <button
                        type="button"
                        onClick={() => setTask(version.task)}
                        style={{ padding: '2px 8px', fontSize: '11px', background: 'transparent', border: '1px solid var(--primary)', color: 'var(--primary)' }}
                      >
                        Restore
                      </button>
                      <button
                        type="button"
                        onClick={() => setTaskHistory(prev => prev.filter(v => v.id !== version.id))}
                        style={{ padding: '2px 8px', fontSize: '11px', background: 'transparent', border: '1px solid var(--danger)', color: 'var(--danger)' }}
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <CostAnalyticsWidget />
        <AgentActivityWidget />
        <CombinedLogView stageFilter={selectedStage || undefined} onClearStageFilter={() => setSelectedStage(null)} />
      </div>

      {comparingVersion && (
        <TaskCompareModal
          currentTask={task}
          historyTask={comparingVersion.task}
          historyVersionText={`[v${taskHistory.length - taskHistory.findIndex(v => v.id === comparingVersion.id)}] ${comparingVersion.timestamp}`}
          onClose={() => setComparingVersion(null)}
          onRestore={() => { setTask(comparingVersion.task); submitTask(); }}
        />
      )}
    </div>
  );
}
