-- Knowledge Base schema (FTS5, cross-project)

CREATE TABLE IF NOT EXISTS kb_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hash TEXT NOT NULL UNIQUE,
  project TEXT NOT NULL,
  category TEXT NOT NULL CHECK(category IN ('solution','decision','pattern','error','session-summary')),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  tags TEXT DEFAULT '',
  source TEXT DEFAULT '',
  github_url TEXT DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  access_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_kb_entries_project ON kb_entries(project);
CREATE INDEX IF NOT EXISTS idx_kb_entries_category ON kb_entries(category);
CREATE INDEX IF NOT EXISTS idx_kb_entries_hash ON kb_entries(hash);
CREATE INDEX IF NOT EXISTS idx_kb_entries_project_category_date ON kb_entries(project, category, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_kb_entries_upsert_key ON kb_entries(project, category, title);

CREATE VIRTUAL TABLE IF NOT EXISTS kb_fts USING fts5(
  title,
  body,
  content='kb_entries',
  content_rowid='id',
  tokenize='porter unicode61'
);

-- Triggers to keep FTS in sync with kb_entries
CREATE TRIGGER IF NOT EXISTS kb_fts_ai AFTER INSERT ON kb_entries BEGIN
  INSERT INTO kb_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;

CREATE TRIGGER IF NOT EXISTS kb_fts_ad AFTER DELETE ON kb_entries BEGIN
  INSERT INTO kb_fts(kb_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
END;

CREATE TRIGGER IF NOT EXISTS kb_fts_au AFTER UPDATE ON kb_entries BEGIN
  INSERT INTO kb_fts(kb_fts, rowid, title, body) VALUES ('delete', old.id, old.title, old.body);
  INSERT INTO kb_fts(rowid, title, body) VALUES (new.id, new.title, new.body);
END;

CREATE TABLE IF NOT EXISTS kb_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project TEXT NOT NULL,
  snapshot_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kb_snapshots_project ON kb_snapshots(project);

CREATE TABLE IF NOT EXISTS kb_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_links (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES kb_entries(id) ON DELETE CASCADE,
  target_id INTEGER NOT NULL REFERENCES kb_entries(id) ON DELETE CASCADE,
  relation TEXT NOT NULL CHECK(relation IN ('solves','depends_on','supersedes','related')),
  created_at TEXT NOT NULL,
  UNIQUE(source_id, target_id, relation)
);
CREATE INDEX IF NOT EXISTS idx_kb_links_source ON kb_links(source_id);
CREATE INDEX IF NOT EXISTS idx_kb_links_target ON kb_links(target_id);
