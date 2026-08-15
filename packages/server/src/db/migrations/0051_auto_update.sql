-- Scheduled unattended self-update (see modules/admin/autoUpdateScheduler.ts)
-- and a history log of update attempts (manual + auto). Off by default -
-- an admin has to explicitly opt in via the /admin panel.
ALTER TABLE instance_settings ADD COLUMN auto_update_enabled INTEGER NOT NULL DEFAULT 0;
ALTER TABLE instance_settings ADD COLUMN auto_update_channel TEXT NOT NULL DEFAULT 'nightly';
ALTER TABLE instance_settings ADD COLUMN auto_update_time TEXT;
ALTER TABLE instance_settings ADD COLUMN auto_update_sudo_password_encrypted TEXT;

-- History of update attempts (manual admin-triggered or scheduled auto-update)
-- - see modules/admin/service.ts and modules/admin/autoUpdateScheduler.ts.
CREATE TABLE update_runs (
  id TEXT PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  trigger TEXT NOT NULL,
  channel TEXT NOT NULL,
  from_version TEXT NOT NULL,
  to_version TEXT,
  status TEXT NOT NULL,
  error_message TEXT
);
