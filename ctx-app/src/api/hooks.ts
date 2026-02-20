import { useCallback, useEffect, useRef, useState } from 'react';
import type { ApiClient } from './client';
import type { AppState } from './types';

type Status = 'connecting' | 'live' | 'error';

function readTokenForEvents(): string {
  const query = new URLSearchParams(window.location.search);
  return query.get('token') || localStorage.getItem('ctx-dashboard-token') || '';
}

function makeEventsUrl(): string {
  const token = readTokenForEvents();
  if (!token) return '/events';
  return `/events?token=${encodeURIComponent(token)}`;
}

function isElectronRuntime(): boolean {
  const maybe = window as Window & { isElectron?: boolean; ctxApi?: unknown };
  return Boolean(maybe.isElectron && maybe.ctxApi);
}

export function useCtxState(client: ApiClient) {
  const [state, setState] = useState<AppState | null>(null);
  const [status, setStatus] = useState<Status>('connecting');
  const [error, setError] = useState<string>('');
  const reconnectTimer = useRef<number | null>(null);
  const sourceRef = useRef<EventSource | null>(null);

  const refresh = useCallback(async () => {
    try {
      const snapshot = await client.getState();
      setState(snapshot);
      setError('');
      setStatus('live');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [client]);

  const connect = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
    }

    const source = new EventSource(makeEventsUrl());
    sourceRef.current = source;

    source.addEventListener('full', (event) => {
      try {
        const payload = JSON.parse(event.data);
        setState(payload);
        setStatus('live');
        setError('');
      } catch {
        // Ignore parse errors and keep stream running.
      }
    });

    source.onerror = () => {
      setStatus('error');
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      if (reconnectTimer.current !== null) {
        window.clearTimeout(reconnectTimer.current);
      }
      reconnectTimer.current = window.setTimeout(() => {
        setStatus('connecting');
        connect();
      }, 3000);
    };
  }, []);

  useEffect(() => {
    void refresh();
    if (isElectronRuntime()) {
      const poll = window.setInterval(() => {
        void refresh();
      }, 3000);
      return () => window.clearInterval(poll);
    }
    connect();
    return () => {
      if (sourceRef.current) sourceRef.current.close();
      if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
    };
  }, [connect, refresh]);

  return { state, status, error, refresh };
}
