import { useMemo } from 'react';
import { X, ChevronRight } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { PipelineState } from '../../api/types';
import { useAppStore } from '../../store/useAppStore';

interface StageDetailPanelProps {
  stage: string | null;
  pipeline: PipelineState | null;
  onSetStage: (stage: string) => void;
  onClose: () => void;
}

export function StageDetailPanel({ stage, pipeline, onSetStage, onClose }: StageDetailPanelProps) {
  const state = useAppStore((s) => s.state);
  const logEntries = state?.log || [];

  const stageEntries = useMemo(() => {
    if (!stage) return [];
    return logEntries
      .filter((e) => e.stage === stage)
      .slice(-20)
      .reverse();
  }, [logEntries, stage]);

  const isActive = pipeline?.stage === stage;
  const updatedAt = pipeline?.updatedAt ? new Date(pipeline.updatedAt).toLocaleTimeString() : '—';

  return (
    <AnimatePresence>
      {stage ? (
        <motion.aside
          key="stage-detail"
          initial={{ x: 300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 300, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          style={{
            width: 320,
            minHeight: 200,
            border: '1px solid var(--border)',
            borderRadius: 12,
            background: 'var(--surface)',
            padding: 16,
            overflow: 'auto',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, textTransform: 'uppercase', fontSize: 14 }}>
              {stage}
              {isActive ? <span style={{ color: 'var(--primary)', fontSize: 11, marginLeft: 8 }}>АКТИВЕН</span> : null}
            </h3>
            <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--muted)' }}>
              <X size={16} />
            </button>
          </div>

          <div style={{ fontSize: 12, color: 'var(--muted)', display: 'grid', gap: 4, marginBottom: 12 }}>
            <div>Ведущий: <strong style={{ color: 'var(--text)' }}>{pipeline?.lead || '—'}</strong></div>
            <div>Задача: <span style={{ color: 'var(--text)' }}>{pipeline?.task || '—'}</span></div>
            <div>Обновлено: {updatedAt}</div>
          </div>

          {!isActive ? (
            <button
              type="button"
              className="nav-btn"
              style={{ fontSize: 12, padding: '6px 12px', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => onSetStage(stage)}
            >
              <ChevronRight size={14} /> Сделать текущим этапом
            </button>
          ) : null}

          <h4 style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted)' }}>
            Лог этапа ({stageEntries.length})
          </h4>
          {stageEntries.length === 0 ? (
            <p style={{ fontSize: 11, color: 'var(--muted)', opacity: 0.6 }}>Нет записей для этого этапа</p>
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 4 }}>
              {stageEntries.map((entry, i) => (
                <li key={i} style={{ fontSize: 11, borderBottom: '1px solid var(--border-soft)', paddingBottom: 4 }}>
                  <span style={{ color: 'var(--muted)' }}>{entry.ts || entry.time || ''}</span>{' '}
                  <span style={{ color: 'var(--primary)', textTransform: 'uppercase' }}>{entry.action || ''}</span>{' '}
                  <span>{entry.message || ''}</span>
                </li>
              ))}
            </ul>
          )}
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
