import type { ApiClient, TerminalSession } from '../../api/client';
import type { TeamConfig } from './TeamConfigurator';
import { TerminalPanel } from '../orchestrator/TerminalPanel';

interface BrainstormViewProps {
  topic: string;
  onTopicChange: (topic: string) => void;
  sessions: TerminalSession[];
  client: ApiClient;
  onLaunch: () => void;
  onKill: (sessionId: string) => void;
  onDelete: (sessionId: string) => void;
  busy: boolean;
  activeTeam: TeamConfig | null;
  synthesisText: string;
  onSynthesisChange: (text: string) => void;
}

export function BrainstormView({
  topic,
  onTopicChange,
  sessions,
  client,
  onLaunch,
  onKill,
  onDelete,
  busy,
  activeTeam,
  synthesisText,
  onSynthesisChange,
}: BrainstormViewProps) {
  const activeSessions = sessions.filter((s) => s.status === 'running' || s.status === 'starting');
  const allDone = sessions.length > 0 && activeSessions.length === 0;

  return (
    <div className="bs-container">
      {/* Topic input */}
      <div className="bs-topic-section">
        <h3>Мозговой штурм</h3>
        <p className="cc-muted">Каждый участник команды анализирует тему со своей позиции. Затем результаты синтезируются.</p>
        <div className="bs-topic-row">
          <textarea
            className="bs-topic-input"
            value={topic}
            onChange={(e) => onTopicChange(e.target.value)}
            placeholder="Тема для обсуждения..."
            rows={3}
          />
          <div className="bs-topic-actions">
            <button
              type="button"
              className="cc-btn cc-btn-primary"
              onClick={onLaunch}
              disabled={busy || !topic.trim() || !activeTeam}
            >
              {busy ? 'Запуск...' : sessions.length > 0 ? 'Перезапустить' : 'Начать обсуждение'}
            </button>
            {activeTeam && (
              <span className="bs-team-info">
                Команда: {activeTeam.name} ({activeTeam.members.length + 1} агентов)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Agent responses */}
      {sessions.length > 0 && (
        <div className="bs-responses">
          <div className="bs-responses-header">
            <h4>
              Мнения участников
              {activeSessions.length > 0 && (
                <span className="bs-progress">
                  {' '}({sessions.length - activeSessions.length}/{sessions.length} готово)
                </span>
              )}
            </h4>
            {allDone && <span className="bs-done-badge">Все завершили</span>}
          </div>

          <div className="bs-terminals-grid">
            {sessions.map((session) => (
              <TerminalPanel
                key={session.id}
                session={session}
                client={client}
                onKill={() => onKill(session.id)}
                onDelete={() => onDelete(session.id)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Synthesis section (appears when all done) */}
      {allDone && (
        <div className="bs-synthesis">
          <h4>Синтез результатов</h4>
          <p className="cc-muted">
            Проанализируйте мнения всех участников. Что общего? В чём расходятся? Какие уникальные идеи?
          </p>
          <div className="bs-synthesis-template">
            <div className="bs-synthesis-prompts">
              <button
                type="button"
                className="bs-prompt-btn"
                onClick={() =>
                  onSynthesisChange(
                    `## Общее\n- \n\n## Различия\n- \n\n## Уникальные идеи\n- \n\n## Решение\n`
                  )
                }
              >
                Шаблон: Структурированный
              </button>
              <button
                type="button"
                className="bs-prompt-btn"
                onClick={() =>
                  onSynthesisChange(
                    `## Консенсус\nВсе участники согласны: \n\n## Ключевые инсайты\n1. \n\n## Следующие шаги\n- `
                  )
                }
              >
                Шаблон: Консенсус
              </button>
            </div>
          </div>
          <textarea
            className="bs-synthesis-textarea"
            value={synthesisText}
            onChange={(e) => onSynthesisChange(e.target.value)}
            placeholder="Запишите синтез мнений..."
            rows={10}
          />
        </div>
      )}
    </div>
  );
}
