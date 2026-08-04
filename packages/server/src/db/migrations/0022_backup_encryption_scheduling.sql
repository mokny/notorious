CREATE TABLE workspace_backup_keys (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  encrypted_key TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE backup_destinations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  retention_count INTEGER NOT NULL DEFAULT 7,
  config TEXT NOT NULL DEFAULT '{}',
  encrypted_credential TEXT,
  host_key_fingerprint TEXT,
  last_run_at TEXT,
  last_run_status TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX backup_destinations_workspace_id_idx ON backup_destinations(workspace_id);

CREATE TABLE backup_schedules (
  workspace_id TEXT PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  weekdays TEXT NOT NULL,
  time TEXT NOT NULL,
  interval_weeks INTEGER NOT NULL DEFAULT 1,
  anchor_week_start TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  next_run_at TEXT,
  last_run_at TEXT,
  last_run_status TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
