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
  explore_component REAL NOT NULL,
  alpha REAL NOT NULL,
  delta REAL,
  is_diverged INTEGER DEFAULT 0,
  routing_mode TEXT NOT NULL DEFAULT 'static'
);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_ts ON routing_decisions(timestamp);
CREATE INDEX IF NOT EXISTS idx_routing_decisions_provider ON routing_decisions(selected_provider);
