import { useEffect, useRef, useState, useCallback } from 'react';
import type { ApiClient, TerminalLine, TerminalSession } from '../../api/client';

interface TerminalPanelProps {
  session: TerminalSession;
  client: ApiClient;
  onKill: () => void;
  onDelete: () => void;
}

const LINE_COLOR: Record<string, string> = {
  stdout: 'var(--text)',
  stderr: 'var(--danger)',
  system: 'var(--muted)'
};

export function TerminalPanel({ session, client, onKill, onDelete }: TerminalPanelProps) {
  const [lines, setLines] = useState<TerminalLine[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState(session.status);
  const bottomRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Connect SSE stream
  useEffect(() => {
    const url = client.getTerminalStreamUrl(session.id);
    const es = new EventSource(url);
    esRef.current = es;

    es.onmessage = (event) => {
      try {
        const line: TerminalLine = JSON.parse(event.data);
        setLines((prev) => {
          const next = [...prev, line];
          // Keep last 500 lines in UI
          return next.length > 500 ? next.slice(next.length - 500) : next;
        });
        // Detect status changes from system lines
        if (line.type === 'system') {
          if (line.text.includes('exited')) setStatus('done');
          if (line.text.includes('error') || line.text.includes('Failed')) setStatus('error');
          if (line.text.includes('Spawning')) setStatus('running');
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      // SSE will auto-reconnect; only mark error if session is done
      if (status === 'done' || status === 'error') {
        es.close();
      }
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [session.id, client, status]);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  const sendInput = useCallback(async () => {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await client.sendSessionInput(session.id, text);
      setInput('');
    } catch (err) {
      console.error('sendInput failed:', err);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [input, sending, client, session.id]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendInput();
    }
  };

  const statusColor = {
    starting: 'var(--muted)',
    running: 'var(--success)',
    idle: 'var(--warning)',
    done: 'var(--muted)',
    error: 'var(--danger)'
  }[status] || 'var(--muted)';

  return (
    <div className="term-panel">
      <div className="term-header">
        <div className="term-title">
          <span className="term-status-dot" style={{ background: statusColor }} />
          <strong>{session.label}</strong>
          {session.branch ? (
            <span className="term-branch muted">{session.branch}</span>
          ) : null}
          <span className="term-status-text muted" style={{ color: statusColor }}>
            {status}
          </span>
        </div>
        <div className="term-actions">
          {status === 'running' || status === 'starting' ? (
            <button type="button" className="term-btn" onClick={onKill} title="Остановить процесс">
              Стоп
            </button>
          ) : null}
          {status === 'done' || status === 'error' ? (
            <button type="button" className="term-btn term-btn-danger" onClick={onDelete} title="Удалить панель">
              Удалить
            </button>
          ) : null}
        </div>
      </div>

      <div className="term-output" role="log" aria-live="polite" aria-label={`Output for ${session.label}`}>
        {lines.map((line, i) => (
          <div
            key={i}
            className="term-line"
            style={{ color: LINE_COLOR[line.type] || 'var(--text)' }}
          >
            <span className="term-ts">{line.ts.slice(11, 19)}</span>
            <span className="term-text">{line.text}</span>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {(status === 'running' || status === 'idle') ? (
        <div className="term-input-row">
          <span className="term-prompt muted">{'>'}</span>
          <input
            ref={inputRef}
            type="text"
            className="term-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ввод для процесса..."
            disabled={sending}
            aria-label="Terminal input"
          />
          <button
            type="button"
            className="term-send-btn"
            onClick={sendInput}
            disabled={sending || !input.trim()}
          >
            Отправить
          </button>
        </div>
      ) : null}
    </div>
  );
}
