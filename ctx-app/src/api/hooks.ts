import { useCallback, useEffect, useRef } from 'react';
import type { ApiClient } from './client';
import { useAppStore } from '../store/useAppStore';

function readTokenForEvents(): string {
  const query = new URLSearchParams(window.location.search);
  const fromUrl = query.get('token');
  if (fromUrl) return fromUrl;
  const fromStorage = localStorage.getItem('ctx-dashboard-token');
  if (fromStorage) return fromStorage;
  const fromWindow = (window as unknown as Record<string, string>).__CTX_TOKEN__;
  return fromWindow || '';
}

function makeEventsUrl(): string {
  const token = readTokenForEvents();
  if (!token) return '/events';
  return `/events?token=${encodeURIComponent(token)}`;
}

export function useCtxConnection(client: ApiClient) {
  const { setState, setStatus, setError } = useAppStore.getState();
  const reconnectTimer = useRef<number | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const retryCount = useRef(0);

  const refresh = useCallback(async () => {
    try {
      const snapshot = await client.getState();
      setState(snapshot);
      retryCount.current = 0;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [client, setState, setError]);

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
        retryCount.current = 0;
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
      // Exponential backoff: 1s, 2s, 4s, 8s, max 30s
      const delay = Math.min(1000 * Math.pow(2, retryCount.current), 30000);
      retryCount.current += 1;
      reconnectTimer.current = window.setTimeout(() => {
        setStatus('connecting');
        connect();
      }, delay);
    };
  }, [setState, setStatus]);

  useEffect(() => {
    void refresh();
    connect();
    return () => {
      if (sourceRef.current) sourceRef.current.close();
      if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
    };
  }, [connect, refresh]);

  return { refresh };
}
