import { create } from 'zustand';
import type { AppState } from '../api/types';

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

export const useAppStore = create<AppStore>((set) => ({
  state: null,
  status: 'connecting',
  error: '',
  activeTab: 'dashboard',
  theme: (localStorage.getItem('ctx-theme') as 'dark' | 'light') || 'dark',
  setState: (state) => set({ state, status: 'live', error: '' }),
  setStatus: (status) => set({ status }),
  setError: (error) => set({ error, status: 'error' }),
  setActiveTab: (activeTab) => set({ activeTab }),
  setTheme: (theme) => {
    localStorage.setItem('ctx-theme', theme);
    set({ theme });
  },
}));
