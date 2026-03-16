import { useState, useRef, useCallback } from 'react';

interface CommandBarProps {
  onCommand: (command: string) => void;
  task: string;
  onTaskChange: (task: string) => void;
  pipelineStage: string;
  projectName?: string;
}

const SUGGESTIONS = [
  { cmd: '/brainstorm', desc: 'Start multi-agent brainstorm' },
  { cmd: '/execute', desc: 'Launch team execution' },
  { cmd: '/delegate', desc: 'Delegate task to specific agent' },
  { cmd: '/task', desc: 'Set current task' },
  { cmd: '/lead', desc: 'Change lead provider' },
  { cmd: '/review', desc: 'Switch to review mode' },
  { cmd: '/setup', desc: 'Switch to setup mode' },
];

export function CommandBar({ onCommand, task, onTaskChange, pipelineStage, projectName }: CommandBarProps) {
  const [input, setInput] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filteredSuggestions = input.startsWith('/')
    ? SUGGESTIONS.filter((s) => s.cmd.startsWith(input.toLowerCase()))
    : [];

  const submit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed) return;
    onCommand(trimmed);
    setInput('');
    setShowSuggestions(false);
  }, [input, onCommand]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
    if (e.key === 'Escape') {
      setShowSuggestions(false);
    }
  };

  const applySuggestion = (cmd: string) => {
    setInput(cmd + ' ');
    setShowSuggestions(false);
    inputRef.current?.focus();
  };

  return (
    <div className="cmd-bar-container">
      <div className="cmd-bar-context">
        {projectName && <span className="cmd-bar-project">{projectName}</span>}
        <span className={`cmd-bar-stage cmd-bar-stage-${pipelineStage}`}>{pipelineStage}</span>
      </div>
      <div className="cmd-bar-input-wrap">
        <span className="cmd-bar-icon">{'>'}</span>
        <input
          ref={inputRef}
          id="cmd-input"
          type="text"
          className="cmd-bar-input"
          value={input}
          onChange={(e) => {
            setInput(e.target.value);
            setShowSuggestions(e.target.value.startsWith('/'));
          }}
          onFocus={() => {
            if (input.startsWith('/')) setShowSuggestions(true);
          }}
          onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
          onKeyDown={handleKeyDown}
          placeholder="Опишите задачу или введите /команду..."
          autoComplete="off"
        />
        <button
          type="button"
          className="cmd-bar-submit"
          onClick={submit}
          disabled={!input.trim()}
        >
          Выполнить
        </button>
      </div>
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="cmd-bar-suggestions">
          {filteredSuggestions.map((s) => (
            <button
              key={s.cmd}
              type="button"
              className="cmd-bar-suggestion"
              onMouseDown={() => applySuggestion(s.cmd)}
            >
              <span className="cmd-bar-suggestion-cmd">{s.cmd}</span>
              <span className="cmd-bar-suggestion-desc">{s.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
