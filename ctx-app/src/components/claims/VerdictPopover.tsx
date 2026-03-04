import { useEffect, useRef } from 'react';
import type { ClaimPosition } from '../../api/types';

interface VerdictPopoverProps {
  claimId: string;
  claimText: string;
  positions: ClaimPosition[];
  currentVerdict: 'true' | 'false' | null;
  onVerdict: (claimId: string, verdict: 'true' | 'false' | null) => void;
  onClose: () => void;
}

export function VerdictPopover({
  claimId,
  claimText,
  positions,
  currentVerdict,
  onVerdict,
  onClose,
}: VerdictPopoverProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const accepts = positions.filter((p) => p.stance === 'accept');
  const challenges = positions.filter((p) => p.stance === 'challenge');

  return (
    <div className="verdict-popover" ref={ref}>
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
        [{claimId}] {claimText}
      </div>

      {accepts.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600, marginBottom: 2 }}>
            Принимают:
          </div>
          {accepts.map((p, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--muted)', paddingLeft: 8 }}>
              {p.alias}
            </div>
          ))}
        </div>
      )}

      {challenges.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600, marginBottom: 2 }}>
            Оспаривают:
          </div>
          {challenges.map((p, i) => (
            <div key={i} style={{ fontSize: 11, color: 'var(--muted)', paddingLeft: 8 }}>
              <strong>{p.alias}</strong>
              {p.argument ? `: ${p.argument}` : ''}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
        <button
          type="button"
          style={{
            flex: 1,
            background: currentVerdict === 'true'
              ? 'var(--success)'
              : 'var(--surface-alt)',
            color: currentVerdict === 'true' ? '#fff' : 'var(--text)',
            fontSize: 12,
            padding: '6px 10px',
          }}
          onClick={() => onVerdict(claimId, 'true')}
        >
          Истина
        </button>
        <button
          type="button"
          style={{
            flex: 1,
            background: currentVerdict === 'false'
              ? 'var(--danger)'
              : 'var(--surface-alt)',
            color: currentVerdict === 'false' ? '#fff' : 'var(--text)',
            fontSize: 12,
            padding: '6px 10px',
          }}
          onClick={() => onVerdict(claimId, 'false')}
        >
          Ложь
        </button>
        {currentVerdict && (
          <button
            type="button"
            style={{
              flex: 1,
              background: 'var(--surface-alt)',
              color: 'var(--muted)',
              fontSize: 12,
              padding: '6px 10px',
            }}
            onClick={() => onVerdict(claimId, null)}
          >
            Сбросить
          </button>
        )}
      </div>
    </div>
  );
}
