import { useEffect, useMemo } from 'react';
import { createApiClient } from './api/client';
import { useCtxConnection } from './api/hooks';
import { useAppStore } from './store/useAppStore';
import { Sidebar } from './components/layout/Sidebar';
import { ErrorBoundary } from './components/layout/ErrorBoundary';
import { DashboardPage } from './pages/Dashboard';
import { KnowledgePage } from './pages/Knowledge';
import { AgentsPage } from './pages/Agents';
import { SettingsPage } from './pages/Settings';
import { TerminalPage } from './pages/Terminal';
import { RoutingPage } from './pages/Routing';
import { DebatesPage } from './pages/Debates';

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
      if (event.key.toLowerCase() === 't') {
        event.preventDefault();
        setActiveTab('dashboard');
        requestAnimationFrame(() => {
          const input = document.getElementById('task-input') as HTMLInputElement | null;
          input?.focus();
          input?.select();
        });
      }
      if (event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setActiveTab('knowledge');
        requestAnimationFrame(() => {
          const input = document.getElementById('kb-search-input') as HTMLInputElement | null;
          input?.focus();
          input?.select();
        });
      }
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
            {activeTab === 'dashboard' ? (
              <DashboardPage client={client} onRefresh={refresh} />
            ) : null}
            {activeTab === 'knowledge' ? (
              <KnowledgePage client={client} />
            ) : null}
            {activeTab === 'agents' ? <AgentsPage client={client} /> : null}
            {activeTab === 'routing' ? <RoutingPage client={client} /> : null}
            {activeTab === 'debates' ? <DebatesPage client={client} /> : null}
            {activeTab === 'settings' ? (
              <SettingsPage client={client} onRefresh={refresh} />
            ) : null}
            {activeTab === 'terminal' ? <TerminalPage client={client} /> : null}
          </ErrorBoundary>
        </main>
      </div>
    </div>
  );
}

export default App;
