import { create } from 'zustand';
import type { AppState } from '../api/types';
import {
  buildShellSearch,
  persistShellTab,
  persistShellTheme,
  readStoredShellTheme,
  resolveInitialShellTab,
} from '../../../scripts/contracts/shell-schemas.js';

import type { AppTab } from '../components/layout/Sidebar';

interface AppStore {
  state: AppState | null;
  status: 'connecting' | 'live' | 'error';
  error: string;
  activeTab: AppTab;
  theme: 'dark' | 'light';
  setState: (state: AppState) => void;
  setStatus: (status: 'connecting' | 'live' | 'error') => void;
  setError: (error: string) => void;
  setActiveTab: (tab: AppTab) => void;
  setTheme: (theme: 'dark' | 'light') => void;
}

function getBrowserStorage() {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getInitialActiveTab(): AppTab {
  if (typeof window === 'undefined') return 'dashboard';
  return resolveInitialShellTab({
    search: window.location.search,
    storage: getBrowserStorage(),
  }) as AppTab;
}

function syncActiveTabUrl(activeTab: AppTab) {
  if (typeof window === 'undefined') return;
  const nextSearch = buildShellSearch(window.location.search, activeTab);
  const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
  const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextUrl === currentUrl) return;
  window.history.replaceState(window.history.state, '', nextUrl);
}

export const useAppStore = create<AppStore>((set) => ({
  state: null,
  status: 'connecting',
  error: '',
  activeTab: getInitialActiveTab(),
  theme: readStoredShellTheme(getBrowserStorage()) as 'dark' | 'light',
  setState: (state) => set({ state, status: 'live', error: '' }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error, status: 'error' }),
  setActiveTab: (activeTab) => {
    const storage = getBrowserStorage();
    persistShellTab(storage, activeTab);
    syncActiveTabUrl(activeTab);
    set({ activeTab });
  },
  setTheme: (theme) => {
    persistShellTheme(getBrowserStorage(), theme);
    set({ theme });
  },
}));
