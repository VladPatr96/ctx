import type { PipelineState } from '../../api/types';

const STAGES = ['detect', 'context', 'task', 'brainstorm', 'plan', 'execute', 'done'];

interface PipelineBarProps {
  pipeline: PipelineState | null;
}

export function PipelineBar({ pipeline }: PipelineBarProps) {
  const activeIndex = STAGES.indexOf((pipeline?.stage || '').toLowerCase());

  return (
    <div className="pipeline-bar">
      {STAGES.map((stage, index) => {
        let cls = 'stage pending';
        if (index < activeIndex) cls = 'stage done';
        if (index === activeIndex) cls = 'stage active';
        return (
          <div className={cls} key={stage}>
            {stage.toUpperCase()}
          </div>
        );
      })}
    </div>
  );
}
