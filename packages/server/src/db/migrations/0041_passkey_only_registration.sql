-- Allows passkey-only registration (email + name + passkey, no password) - see
-- modules/auth/service.ts's `registerUserWithPasskey`. SQLite has no ALTER COLUMN, so
-- password_hash's NOT NULL constraint is dropped via the standard rebuild-and-rename dance;
-- every other column/value is carried over unchanged. Other tables' `REFERENCES users(id)`
-- foreign keys resolve again as soon as the new table is renamed back to `users` - DROP TABLE
-- itself isn't a row-level operation, so it isn't blocked by `PRAGMA foreign_keys = ON`.
CREATE TABLE users_new (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  name TEXT NOT NULL,
  avatar_color TEXT NOT NULL DEFAULT '#6366f1',
  avatar_url TEXT,
  created_at TEXT NOT NULL,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  totp_backup_codes TEXT,
  push_show_when_open INTEGER NOT NULL DEFAULT 1
);

INSERT INTO users_new (id, email, password_hash, name, avatar_color, avatar_url, created_at, totp_secret, totp_enabled, totp_backup_codes, push_show_when_open)
SELECT id, email, password_hash, name, avatar_color, avatar_url, created_at, totp_secret, totp_enabled, totp_backup_codes, push_show_when_open FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

-- Carries an unauthenticated registration ceremony's email/name forward to its verify step -
-- see db/schema.ts's doc comment on webauthnChallenges.
ALTER TABLE webauthn_challenges ADD COLUMN pending_email TEXT;
ALTER TABLE webauthn_challenges ADD COLUMN pending_name TEXT;

-- Speeds up the "does this account have a passkey?" check now run on every login/register/
-- email-change response (see modules/webauthn/service.ts's `hasAnyCredential`, called from
-- modules/auth/service.ts's `toUser`) - previously only queried from the Settings page.
CREATE INDEX idx_webauthn_credentials_user_id ON webauthn_credentials(user_id);
