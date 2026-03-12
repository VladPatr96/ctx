import { useEffect, useMemo, lazy, Suspense } from 'react';
import { createApiClient } from './api/client';
import { useCtxConnection } from './api/hooks';
import { useAppStore } from './store/useAppStore';
import { Sidebar } from './components/layout/Sidebar';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { getShellShortcut } from '../../scripts/contracts/shell-navigation.js';

const DashboardPage = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.DashboardPage })));
const KnowledgePage = lazy(() => import('./pages/Knowledge').then(m => ({ default: m.KnowledgePage })));
const AgentsPage = lazy(() => import('./pages/Agents').then(m => ({ default: m.AgentsPage })));
const SettingsPage = lazy(() => import('./pages/Settings').then(m => ({ default: m.SettingsPage })));
const TerminalPage = lazy(() => import('./pages/Terminal').then(m => ({ default: m.TerminalPage })));
const RoutingPage = lazy(() => import('./pages/Routing').then(m => ({ default: m.RoutingPage })));
const DevPipelinePage = lazy(() => import('./pages/DevPipeline').then(m => ({ default: m.DevPipelinePage })));
const OrchestratorPage = lazy(() => import('./pages/Orchestrator').then(m => ({ default: m.OrchestratorPage })));
const DebatesPage = lazy(() => import('./pages/Debates').then(m => ({ default: m.DebatesPage })));

function App() {
  const client = useMemo(() => createApiClient(), []);
  const { refresh } = useCtxConnection(client);
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const status = useAppStore((s) => s.status);
  const error = useAppStore((s) => s.error);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!event.ctrlKey) return;
      const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase() || '';
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      const shortcut = getShellShortcut(event.key);
      if (!shortcut) return;

      event.preventDefault();
      setActiveTab(shortcut.tab);
      requestAnimationFrame(() => {
        if (!shortcut.focusTargetId) return;
        const input = document.getElementById(shortcut.focusTargetId) as HTMLInputElement | null;
        input?.focus();
        input?.select?.();
      });
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [setActiveTab]);

  return (
    <div className="app-shell">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="app-main">
        <header className="app-header">
          <h1>CTX Панель управления</h1>
          <div className="header-controls">
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? 'Светлая' : 'Тёмная'}
            </button>
            <div className={`status-pill status-${status}`}>
              <span className="dot" />
              <span>{status}</span>
            </div>
          </div>
        </header>

        <main className="app-content">
          {error ? <div className="error-banner">{error}</div> : null}
          <ErrorBoundary key={activeTab}>
            <Suspense fallback={<div className="loading-spinner">Загрузка...</div>}>
              {activeTab === 'dashboard' ? (
                <DashboardPage client={client} onRefresh={refresh} />
              ) : null}
              {activeTab === 'knowledge' ? (
                <KnowledgePage client={client} />
              ) : null}
              {activeTab === 'agents' ? <AgentsPage client={client} /> : null}
              {activeTab === 'routing' ? <RoutingPage client={client} /> : null}
              {activeTab === 'devpipeline' ? <DevPipelinePage client={client} /> : null}
              {activeTab === 'orchestrator' ? <OrchestratorPage client={client} /> : null}
              {activeTab === 'debates' ? <DebatesPage client={client} /> : null}
              {activeTab === 'settings' ? (
                <SettingsPage client={client} onRefresh={refresh} />
              ) : null}
              {activeTab === 'terminal' ? <TerminalPage client={client} /> : null}
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export default App;
