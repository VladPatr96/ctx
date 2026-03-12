import { useCallback, useEffect, useRef } from 'react';
import type { ApiClient } from './client';
import { useAppStore } from '../store/useAppStore';
import {
  SHELL_CONNECTION_BUDGET,
  getShellReconnectDelay,
  shouldRecoverShellSnapshot,
} from '../../../scripts/contracts/shell-connection.js';

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
  const recoveryTimer = useRef<number | null>(null);
  const sourceRef = useRef<EventSource | null>(null);
  const retryCount = useRef(0);
  const lastSnapshotAt = useRef(0);
  const lastRefreshAt = useRef(0);
  const refreshInFlight = useRef(false);

  const refresh = useCallback(async (options: { reportErrors?: boolean } = {}) => {
    if (refreshInFlight.current) return false;

    refreshInFlight.current = true;
    lastRefreshAt.current = Date.now();

    try {
      const snapshot = await client.getState();
      setState(snapshot);
      retryCount.current = 0;
      lastSnapshotAt.current = Date.now();
      return true;
    } catch (err) {
      if (options.reportErrors !== false) {
        setError(err instanceof Error ? err.message : String(err));
      }
      return false;
    } finally {
      refreshInFlight.current = false;
    }
  }, [client, setState, setError]);

  const connect = useCallback(() => {
    if (sourceRef.current) {
      sourceRef.current.close();
    }

    const source = new EventSource(makeEventsUrl());
    sourceRef.current = source;

    source.onopen = () => {
      setStatus(lastSnapshotAt.current > 0 ? 'live' : 'connecting');
    };

    source.addEventListener('full', (event) => {
      try {
        const payload = JSON.parse(event.data);
        setState(payload);
        retryCount.current = 0;
        lastSnapshotAt.current = Date.now();
      } catch {
        // Ignore parse errors and keep stream running.
      }
    });

    source.onerror = () => {
      setStatus(lastSnapshotAt.current > 0 ? 'connecting' : 'error');
      if (sourceRef.current) {
        sourceRef.current.close();
        sourceRef.current = null;
      }
      if (reconnectTimer.current !== null) {
        window.clearTimeout(reconnectTimer.current);
      }

      const delay = getShellReconnectDelay(retryCount.current, SHELL_CONNECTION_BUDGET);
      retryCount.current += 1;
      reconnectTimer.current = window.setTimeout(() => {
        setStatus('connecting');
        connect();
      }, delay);
    };
  }, [setState, setStatus]);

  useEffect(() => {
    void refresh({ reportErrors: true });
    connect();

    recoveryTimer.current = window.setInterval(() => {
      if (shouldRecoverShellSnapshot({
        lastSnapshotAt: lastSnapshotAt.current,
        lastRefreshAt: lastRefreshAt.current,
        now: Date.now(),
        budget: SHELL_CONNECTION_BUDGET,
      })) {
        setStatus('connecting');
        void refresh({ reportErrors: false });
      }
    }, SHELL_CONNECTION_BUDGET.recoveryPollMs);

    return () => {
      if (sourceRef.current) sourceRef.current.close();
      if (reconnectTimer.current !== null) window.clearTimeout(reconnectTimer.current);
      if (recoveryTimer.current !== null) window.clearInterval(recoveryTimer.current);
    };
  }, [connect, refresh, setStatus]);

  return {
    refresh: async () => {
      await refresh({ reportErrors: true });
    }
  };
}
