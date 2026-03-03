import { useEffect, useMemo, useState } from 'react';
import type { ApiClient, TerminalCommandResult } from '../api/client';

interface TerminalPageProps {
  client: ApiClient;
}

interface RunEntry {
  id: string;
  command: string;
  result: TerminalCommandResult;
}

const DEFAULT_COMMAND = 'node -v';

export function TerminalPage({ client }: TerminalPageProps) {
  const [command, setCommand] = useState(DEFAULT_COMMAND);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [history, setHistory] = useState<RunEntry[]>([]);

  const isElectron = Boolean(window.isElectron && window.ctxApi);

  useEffect(() => {
    client.getTerminalAllowlist()
      .then((items) => setAllowlist(items))
      .catch(() => setAllowlist([]));
  }, [client]);

  const runCommand = async () => {
    const next = command.trim();
    if (!next) return;
    setBusy(true);
    setError('');
    try {
      const result = await client.runTerminalCommand(next);
      setHistory((prev) => [
        {
          id: `${Date.now()}-${prev.length}`,
          command: next,
          result
        },
        ...prev
      ].slice(0, 20));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const allowlistText = useMemo(() => {
    if (allowlist.length === 0) return 'список недоступен';
    return allowlist.join(', ');
  }, [allowlist]);

  return (
    <div className="page-grid">
      <section className="panel">
        <h3>Терминал</h3>
        <p className="muted">
          {isElectron
            ? 'Выполняет разрешённые команды через Electron IPC.'
            : 'Терминал доступен только в десктопном (Electron) режиме.'}
        </p>
        <p className="muted">Разрешённые команды: {allowlistText}</p>
        <div className="row">
          <input
            id="terminal-input"
            type="text"
            value={command}
            onChange={(event) => setCommand(event.target.value)}
            placeholder="Введите разрешённую команду..."
            disabled={!isElectron || busy}
          />
          <button type="button" onClick={() => void runCommand()} disabled={!isElectron || busy}>
            {busy ? 'Выполняется...' : 'Запустить'}
          </button>
        </div>
        {error ? <p className="error-text">{error}</p> : null}
      </section>

      <section className="panel">
        <h3>История</h3>
        {history.length === 0 ? <p className="muted">Команд пока нет</p> : null}
        <div className="result-stream">
          {history.map((entry) => (
            <article className="result-card" key={entry.id}>
              <header>
                <strong>{entry.command}</strong>
                <span>{entry.result.durationMs} ms</span>
              </header>
              <p className={entry.result.ok ? 'muted' : 'error-text'}>
                {entry.result.ok ? `код выхода ${entry.result.code}` : entry.result.error || 'ошибка'}
              </p>
              {entry.result.stdout ? (
                <pre>{entry.result.stdout.slice(0, 2500)}</pre>
              ) : null}
              {entry.result.stderr ? (
                <pre>{entry.result.stderr.slice(0, 2500)}</pre>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
