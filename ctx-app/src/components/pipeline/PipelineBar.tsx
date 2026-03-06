import type { PipelineState } from '../../api/types';

const STAGES = ['detect', 'context', 'task', 'brainstorm', 'plan', 'execute', 'done'];

interface PipelineBarProps {
  pipeline: PipelineState | null;
}

export function PipelineBar({ pipeline }: PipelineBarProps) {
  const activeIndex = STAGES.indexOf((pipeline?.stage || '').toLowerCase());

  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '24px', paddingTop: '8px' }}>
      {STAGES.map((stage, index) => {
        const isDone = index < activeIndex;
        const isActive = index === activeIndex;

        let icon = '○';
        if (isDone) icon = '✓';
        if (isActive) icon = '⏱';

        let color = 'var(--muted)';
        if (isDone) color = 'var(--success)';
        if (isActive) color = 'var(--primary)';

        return (
          <div key={stage} style={{ display: 'flex', alignItems: 'center', flex: 1 }}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', flexShrink: 0, width: '60px', position: 'relative' }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  border: `2px solid ${color}`,
                  color: color,
                  backgroundColor: isActive ? 'color-mix(in srgb, var(--primary), transparent 85%)' : isDone ? 'color-mix(in srgb, var(--success), transparent 85%)' : 'var(--surface-alt)',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  zIndex: 2,
                }}
              >
                {icon}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <span style={{ fontSize: '10px', color, fontWeight: isActive ? 'bold' : '500', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {stage}
                </span>
                {isActive && (
                  <span style={{ fontSize: '9px', color: 'var(--primary)', marginTop: '2px', opacity: 0.8 }}>
                    in progress
                  </span>
                )}
              </div>
            </div>
            {/* Connector line */}
            {index < STAGES.length - 1 && (
              <div style={{
                flex: 1,
                height: '2px',
                backgroundColor: index < activeIndex ? 'var(--success)' : 'var(--border)',
                opacity: index < activeIndex ? 0.8 : 0.5,
                margin: '0 -20px',
                zIndex: 1,
                transform: 'translateY(-14px)' // Center with the circle since circles are at the top
              }} />
            )}
          </div>
        );
      })}
    </div>
  );
}
