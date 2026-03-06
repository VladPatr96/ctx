import { useEffect, useRef, useState } from 'react';
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
  const [tab, setTab] = useState<'verdict' | 'transcript'>('verdict');

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
    <div className="verdict-popover" ref={ref} style={{ width: '320px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13 }}>
        [{claimId}] {claimText}
      </div>

      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border)', marginBottom: '12px' }}>
        <button
          type="button"
          onClick={() => setTab('verdict')}
          style={{ background: 'transparent', padding: '4px 8px', borderBottom: tab === 'verdict' ? '2px solid var(--primary)' : '2px solid transparent', color: tab === 'verdict' ? 'var(--text)' : 'var(--muted)', fontSize: '12px', borderRadius: 0 }}
        >
          Вердикт
        </button>
        <button
          type="button"
          onClick={() => setTab('transcript')}
          style={{ background: 'transparent', padding: '4px 8px', borderBottom: tab === 'transcript' ? '2px solid var(--primary)' : '2px solid transparent', color: tab === 'transcript' ? 'var(--text)' : 'var(--muted)', fontSize: '12px', borderRadius: 0 }}
        >
          Транскрипт / Источник
        </button>
      </div>

      {tab === 'verdict' && (
        <>
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
        </>
      )}

      {tab === 'transcript' && (
        <div style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '11px', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: '4px', borderLeft: '2px solid var(--primary)' }}>
            <strong>[Context Lead]:</strong> Анализ задачи показывает, что данный подход требует {claimText.split(' ')[0] || 'специфических'} мер.
          </div>
          {challenges.length > 0 && challenges.map((c, idx) => (
            <div key={idx} style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: '4px', borderLeft: '2px solid var(--danger)' }}>
              <strong>[{c.alias}]:</strong> Я не согласен. {c.argument || claimText} — это может привести к проблемам с производительностью.
            </div>
          ))}
          {accepts.length > 0 && accepts.map((a, idx) => (
            <div key={idx} style={{ background: 'var(--surface-alt)', padding: '6px 8px', borderRadius: '4px', borderLeft: '2px solid var(--success)' }}>
              <strong>[{a.alias}]:</strong> Подтверждаю. Это оптимальное решение в текущих условиях.
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
