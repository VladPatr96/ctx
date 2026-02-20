import { useEffect, useMemo, useState } from 'react';
import { createApiClient } from './api/client';
import { useCtxState } from './api/hooks';
import { Sidebar, type AppTab } from './components/layout/Sidebar';
import { DashboardPage } from './pages/Dashboard';
import { KnowledgePage } from './pages/Knowledge';
import { AgentsPage } from './pages/Agents';
import { SettingsPage } from './pages/Settings';
import { TerminalPage } from './pages/Terminal';

function App() {
  const client = useMemo(() => createApiClient(), []);
  const { state, status, error, refresh } = useCtxState(client);
  const [activeTab, setActiveTab] = useState<AppTab>('dashboard');
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const stored = localStorage.getItem('ctx-theme');
    return stored === 'light' ? 'light' : 'dark';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('ctx-theme', theme);
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
  }, []);

  return (
    <div className="app-shell">
      <Sidebar activeTab={activeTab} onTabChange={setActiveTab} />

      <div className="app-main">
        <header className="app-header">
          <h1>CTX Web Dashboard</h1>
          <div className="header-controls">
            <button
              type="button"
              className="theme-toggle"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
            >
              {theme === 'dark' ? 'Light' : 'Dark'}
            </button>
            <div className={`status-pill status-${status}`}>
              <span className="dot" />
              <span>{status}</span>
            </div>
          </div>
        </header>

        <main className="app-content">
          {error ? <div className="error-banner">{error}</div> : null}
          {activeTab === 'dashboard' ? (
            <DashboardPage client={client} state={state} onRefresh={refresh} />
          ) : null}
          {activeTab === 'knowledge' ? (
            <KnowledgePage client={client} />
          ) : null}
          {activeTab === 'agents' ? <AgentsPage client={client} state={state} /> : null}
          {activeTab === 'settings' ? (
            <SettingsPage client={client} state={state} onRefresh={refresh} />
          ) : null}
          {activeTab === 'terminal' ? <TerminalPage client={client} /> : null}
        </main>
      </div>
    </div>
  );
}

export default App;
