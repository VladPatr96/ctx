import { X, Calendar, Tag, Folder, ExternalLink, Eye } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { KBEntry } from '../../api/types';

interface KBDetailProps {
  entry: KBEntry | null;
  onClose: () => void;
  onEdit?: (entry: KBEntry) => void;
}

export function KBDetail({ entry, onClose, onEdit }: KBDetailProps) {
  if (!entry) return null;

  const createdAt = entry.created_at ? new Date(entry.created_at).toLocaleString('ru-RU') : '—';
  const updatedAt = entry.updated_at ? new Date(entry.updated_at).toLocaleString('ru-RU') : '—';
  const tags = entry.tags ? entry.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];

  return (
    <AnimatePresence>
      <motion.aside
        key="kb-detail"
        initial={{ x: 300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 300, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        style={{
          width: 400,
          minHeight: 200,
          maxHeight: '80vh',
          border: '1px solid var(--border)',
          borderRadius: 12,
          background: 'var(--surface)',
          padding: 16,
          overflow: 'auto',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <h3 style={{ margin: 0, fontSize: 16, lineHeight: 1.3, paddingRight: 8 }}>
            {entry.title}
          </h3>
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {onEdit && (
              <button
                type="button"
                onClick={() => onEdit(entry)}
                style={{
                  background: 'var(--primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  padding: '4px 8px',
                  fontSize: '12px',
                  cursor: 'pointer',
                }}
              >
                Редактировать
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--muted)',
                flexShrink: 0,
              }}
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--muted)', display: 'grid', gap: 8, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Folder size={14} style={{ flexShrink: 0 }} />
            <span>
              Проект: <strong style={{ color: 'var(--text)' }}>{entry.project}</strong>
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Tag size={14} style={{ flexShrink: 0 }} />
            <span>
              Категория: <strong style={{ color: 'var(--text)' }}>{entry.category}</strong>
            </span>
          </div>

          {entry.access_count !== undefined && entry.access_count > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Eye size={14} style={{ flexShrink: 0 }} />
              <span>
                Просмотры: <strong style={{ color: 'var(--text)' }}>{entry.access_count}</strong>
              </span>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Calendar size={14} style={{ flexShrink: 0 }} />
            <span>Создано: {createdAt}</span>
          </div>

          {entry.updated_at && entry.updated_at !== entry.created_at && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Calendar size={14} style={{ flexShrink: 0 }} />
              <span>Обновлено: {updatedAt}</span>
            </div>
          )}

          {entry.source && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ExternalLink size={14} style={{ flexShrink: 0 }} />
              <span>
                Источник: <span style={{ color: 'var(--text)' }}>{entry.source}</span>
              </span>
            </div>
          )}

          {entry.github_url && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <ExternalLink size={14} style={{ flexShrink: 0 }} />
              <a
                href={entry.github_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: 'var(--primary)', textDecoration: 'none' }}
              >
                GitHub →
              </a>
            </div>
          )}
        </div>

        {tags.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <h4 style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted)' }}>Теги</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {tags.map((tag, i) => (
                <span
                  key={i}
                  style={{
                    padding: '4px 8px',
                    fontSize: 11,
                    borderRadius: 4,
                    background: 'var(--surface-hover)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                  }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <h4 style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted)' }}>Содержание</h4>
          <div
            style={{
              fontSize: 13,
              lineHeight: 1.6,
              color: 'var(--text)',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {entry.body}
          </div>
        </div>
      </motion.aside>
    </AnimatePresence>
  );
}
