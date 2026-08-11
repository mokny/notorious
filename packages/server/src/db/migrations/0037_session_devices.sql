ALTER TABLE sessions ADD COLUMN user_agent TEXT;
ALTER TABLE sessions ADD COLUMN ip TEXT;
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;

UPDATE sessions SET last_seen_at = created_at WHERE last_seen_at IS NULL;
