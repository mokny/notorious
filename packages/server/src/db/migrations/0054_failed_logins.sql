-- Failed login attempts (admin panel "Failed Logins" tab, see
-- modules/admin/service.ts) - no FK to users since an attempt against an
-- unknown email has no user row to point at; email is stored as a raw
-- string instead. Pruned to the last 30 days by a cron job (see
-- modules/admin/failedLoginCleanup.ts).
CREATE TABLE failed_login_attempts (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  ip TEXT,
  user_agent TEXT,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_failed_login_attempts_user_id ON failed_login_attempts(user_id);
CREATE INDEX idx_failed_login_attempts_created_at ON failed_login_attempts(created_at);

-- Instance-wide toggle for rate-limiting POST /api/v1/auth/login by IP - off
-- by default, see modules/admin/routes.ts's login rate-limit wiring.
ALTER TABLE instance_settings ADD COLUMN login_rate_limit_enabled INTEGER NOT NULL DEFAULT 0;
