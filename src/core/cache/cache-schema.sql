CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value_blob BLOB NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT,
  content_hash TEXT,
  schema_version INTEGER DEFAULT 1,
  size_bytes INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at);
