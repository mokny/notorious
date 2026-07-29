-- Personal API keys for programmatic access (Authorization: Bearer <token>).
-- Only the SHA-256 hash of the token is stored; the plaintext is shown to the
-- user exactly once, at creation time.
CREATE TABLE api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_used_at TEXT
);
CREATE INDEX idx_api_keys_user ON api_keys(user_id);
