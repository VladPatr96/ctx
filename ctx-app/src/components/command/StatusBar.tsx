interface StatusBarProps {
  activeSessions: number;
  totalSessions: number;
  pipelineStage: string;
  activeTeamName?: string;
  mode: string;
}

export function StatusBar({ activeSessions, totalSessions, pipelineStage, activeTeamName, mode }: StatusBarProps) {
  return (
    <div className="cc-statusbar">
      <div className="cc-statusbar-left">
        <span className="cc-statusbar-item">
          <span className={`cc-statusbar-dot ${activeSessions > 0 ? 'cc-statusbar-dot-active' : ''}`} />
          {activeSessions} активных / {totalSessions} всего
        </span>
        <span className="cc-statusbar-sep" />
        <span className="cc-statusbar-item">
          Pipeline: <strong>{pipelineStage}</strong>
        </span>
      </div>
      <div className="cc-statusbar-right">
        {activeTeamName && (
          <span className="cc-statusbar-item">
            Команда: <strong>{activeTeamName}</strong>
          </span>
        )}
        <span className="cc-statusbar-sep" />
        <span className="cc-statusbar-item cc-statusbar-mode">
          {mode.toUpperCase()}
        </span>
      </div>
    </div>
  );
}
