import { useState, useEffect } from 'react';
import type { ApiClient, EnvironmentHealth } from '../../api/client';

interface ProjectSetupProps {
  client: ApiClient;
  onReady?: () => void;
}

const PROVIDER_COLORS: Record<string, string> = {
  claude: '#d97706',
  gemini: '#4285f4',
  codex: '#10b981',
  opencode: '#8b5cf6',
};

export function ProjectSetup({ client, onReady }: ProjectSetupProps) {
  const [health, setHealth] = useState<EnvironmentHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await client.getEnvironmentHealth();
      setHealth(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, [client]);

  if (loading) {
    return (
      <div className="ps-container">
        <div className="ps-loading">
          <div className="ps-spinner" />
          <span>Проверка окружения...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ps-container">
        <div className="ps-error">
          <p>Ошибка: {error}</p>
          <button type="button" className="cc-btn cc-btn-secondary" onClick={refresh}>Повторить</button>
        </div>
      </div>
    );
  }

  if (!health) return null;

  const allProvidersCount = Object.values(health.providers).filter((p) => p.available).length;
  const totalChecks = [
    health.git.ok,
    health.github.authenticated,
    health.dependencies.installed,
    allProvidersCount > 0,
    health.mcp.hubAvailable,
  ];
  const passedChecks = totalChecks.filter(Boolean).length;
  const allGood = passedChecks === totalChecks.length;

  return (
    <div className="ps-container">
      <div className="ps-header">
        <div className="ps-header-left">
          <h3>Окружение проекта</h3>
          <span className={`ps-health-badge ${allGood ? 'ps-health-ok' : 'ps-health-warn'}`}>
            {passedChecks}/{totalChecks.length} проверок
          </span>
        </div>
        <div className="ps-header-right">
          <button type="button" className="cc-btn cc-btn-ghost" onClick={refresh}>Обновить</button>
          {allGood && onReady && (
            <button type="button" className="cc-btn cc-btn-primary" onClick={onReady}>Всё готово — начать работу</button>
          )}
        </div>
      </div>

      <div className="ps-grid">
        {/* Project */}
        <div className="ps-card">
          <div className="ps-card-header">
            <span className={`ps-status-dot ${health.git.ok ? 'ps-dot-ok' : 'ps-dot-err'}`} />
            <h4>Проект</h4>
          </div>
          <div className="ps-card-body">
            <div className="ps-row">
              <span className="ps-label">Имя</span>
              <span className="ps-value">{health.project.name}</span>
            </div>
            <div className="ps-row">
              <span className="ps-label">Путь</span>
              <span className="ps-value ps-path" title={health.project.path}>{health.project.path}</span>
            </div>
            {health.git.ok && (
              <>
                <div className="ps-row">
                  <span className="ps-label">Ветка</span>
                  <span className="ps-value ps-branch">{health.git.branch}</span>
                </div>
                {health.git.dirty > 0 && (
                  <div className="ps-row">
                    <span className="ps-label">Изменения</span>
                    <span className="ps-value ps-dirty">{health.git.dirty} файлов</span>
                  </div>
                )}
                <div className="ps-row">
                  <span className="ps-label">Stack</span>
                  <span className="ps-value">{health.project.stack || 'N/A'}</span>
                </div>
              </>
            )}
            {!health.git.ok && (
              <div className="ps-warning">Git не инициализирован в этой директории</div>
            )}
          </div>
        </div>

        {/* GitHub */}
        <div className="ps-card">
          <div className="ps-card-header">
            <span className={`ps-status-dot ${health.github.authenticated ? 'ps-dot-ok' : 'ps-dot-err'}`} />
            <h4>GitHub</h4>
          </div>
          <div className="ps-card-body">
            {health.github.authenticated ? (
              <>
                <div className="ps-row">
                  <span className="ps-label">Статус</span>
                  <span className="ps-value ps-connected">Подключен</span>
                </div>
                {health.github.repo && (
                  <>
                    <div className="ps-row">
                      <span className="ps-label">Репозиторий</span>
                      <span className="ps-value">{health.github.repo.owner?.login}/{health.github.repo.name}</span>
                    </div>
                    {health.github.repo.defaultBranchRef && (
                      <div className="ps-row">
                        <span className="ps-label">Default branch</span>
                        <span className="ps-value">{health.github.repo.defaultBranchRef.name}</span>
                      </div>
                    )}
                  </>
                )}
                {health.git.remote && (
                  <div className="ps-row">
                    <span className="ps-label">Remote</span>
                    <span className="ps-value ps-path" title={health.git.remote}>{health.git.remote}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="ps-warning">GitHub CLI не авторизован</div>
                <p className="ps-hint">Выполните: <code>gh auth login</code></p>
              </>
            )}
          </div>
        </div>

        {/* AI Providers */}
        <div className="ps-card ps-card-wide">
          <div className="ps-card-header">
            <span className={`ps-status-dot ${allProvidersCount > 0 ? 'ps-dot-ok' : 'ps-dot-err'}`} />
            <h4>AI Провайдеры</h4>
            <span className="ps-badge">{allProvidersCount}/4</span>
          </div>
          <div className="ps-card-body">
            <div className="ps-providers-grid">
              {Object.entries(health.providers).map(([name, info]) => (
                <div key={name} className={`ps-provider-card ${info.available ? 'ps-provider-ok' : 'ps-provider-missing'}`}>
                  <div className="ps-provider-header">
                    <span className="ps-provider-dot" style={{ background: PROVIDER_COLORS[name] || '#666' }} />
                    <strong>{name}</strong>
                  </div>
                  {info.available ? (
                    <span className="ps-provider-version">v{info.version}</span>
                  ) : (
                    <span className="ps-provider-na">не установлен</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Dependencies & MCP */}
        <div className="ps-card">
          <div className="ps-card-header">
            <span className={`ps-status-dot ${health.dependencies.installed ? 'ps-dot-ok' : 'ps-dot-warn'}`} />
            <h4>Зависимости</h4>
          </div>
          <div className="ps-card-body">
            <div className="ps-row">
              <span className="ps-label">node_modules</span>
              <span className={`ps-value ${health.dependencies.installed ? 'ps-connected' : 'ps-disconnected'}`}>
                {health.dependencies.installed ? 'Установлены' : 'Отсутствуют'}
              </span>
            </div>
            {health.project.hasPackageJson && (
              <div className="ps-row">
                <span className="ps-label">Пакеты</span>
                <span className="ps-value">{health.dependencies.count} зависимостей</span>
              </div>
            )}
            {!health.dependencies.installed && health.project.hasPackageJson && (
              <p className="ps-hint">Выполните: <code>npm install</code></p>
            )}
          </div>
        </div>

        <div className="ps-card">
          <div className="ps-card-header">
            <span className={`ps-status-dot ${health.mcp.hubAvailable ? 'ps-dot-ok' : 'ps-dot-warn'}`} />
            <h4>MCP Hub</h4>
          </div>
          <div className="ps-card-body">
            <div className="ps-row">
              <span className="ps-label">Статус</span>
              <span className={`ps-value ${health.mcp.hubAvailable ? 'ps-connected' : 'ps-disconnected'}`}>
                {health.mcp.hubAvailable ? 'Доступен' : 'Не найден'}
              </span>
            </div>
            {!health.mcp.hubAvailable && (
              <p className="ps-hint">MCP Hub не найден в scripts/ctx-mcp-hub.js</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
