-- Evaluation schema: consilium run tracking
-- Applied to .data/state.sqlite alongside main schema

-- Запуски консилиумов
CREATE TABLE IF NOT EXISTS consilium_runs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT UNIQUE NOT NULL,
  project TEXT NOT NULL,
  topic TEXT NOT NULL,
  mode TEXT DEFAULT 'providers',
  providers_invoked TEXT,
  providers_responded TEXT,
  rounds INTEGER DEFAULT 1,
  proposed_by TEXT,
  consensus_reached INTEGER DEFAULT 1,
  decision_summary TEXT,
  ci_status TEXT,
  github_issue_url TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_consilium_runs_project ON consilium_runs(project);
CREATE INDEX IF NOT EXISTS idx_consilium_runs_started ON consilium_runs(started_at);

-- Ответы провайдеров (детали каждого участника)
CREATE TABLE IF NOT EXISTS provider_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES consilium_runs(run_id),
  provider TEXT NOT NULL,
  model TEXT,
  status TEXT DEFAULT 'completed',
  response_ms INTEGER,
  confidence REAL,
  key_idea TEXT,
  was_chosen INTEGER DEFAULT 0,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_provider_responses_run ON provider_responses(run_id);

-- Routing decisions log (observability for adaptive routing)
CREATE TABLE IF NOT EXISTS routing_decisions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  task_snippet TEXT NOT NULL,
  task_type TEXT NOT NULL,
  selected_provider TEXT NOT NULL,
  runner_up TEXT,
  final_score REAL NOT NULL,
  static_component REAL NOT NULL,
  eval_component REAL NOT NULL,
  feedback_component REAL NOT NULL DEFAULT 0,
  explore_component REAL NOT NULL,
  alpha REAL NOT NULL,
  delta REAL,
  is_diverged INTEGER DEFAULT 0,
  routing_mode TEXT NOT NULL DEFAULT 'static'
);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_ts ON routing_decisions(timestamp);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_provider ON routing_decisions(selected_provider);

-- Operator feedback on routing decisions (feeds adaptive routing back through explicit contract)
CREATE TABLE IF NOT EXISTS routing_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id INTEGER NOT NULL REFERENCES routing_decisions(id),
  timestamp TEXT NOT NULL,
  selected_provider TEXT NOT NULL,
  task_type TEXT NOT NULL,
  verdict TEXT NOT NULL,
  note TEXT,
  actor TEXT NOT NULL DEFAULT 'operator',
  UNIQUE(decision_id, actor)
);
CREATE INDEX IF NOT EXISTS idx_routing_feedback_decision ON routing_feedback(decision_id);
CREATE INDEX IF NOT EXISTS idx_routing_feedback_provider ON routing_feedback(selected_provider);
CREATE INDEX IF NOT EXISTS idx_routing_feedback_ts ON routing_feedback(timestamp);

-- Round-level responses for multi-round consilium
CREATE TABLE IF NOT EXISTS round_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES consilium_runs(run_id),
  round INTEGER NOT NULL,
  provider TEXT NOT NULL,
  alias TEXT,
  status TEXT DEFAULT 'completed',
  response_ms INTEGER,
  response_text TEXT,
  confidence REAL,
  position_changed INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_round_responses_run ON round_responses(run_id);
CREATE INDEX IF NOT EXISTS idx_round_responses_round ON round_responses(run_id, round);

-- Step 5: per-task-type routing support (idempotent via try/catch in eval-store)
-- ALTER TABLE provider_responses ADD COLUMN task_type TEXT;
