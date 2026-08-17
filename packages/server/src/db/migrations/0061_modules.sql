-- Base infrastructure for the module system (see modules/moduleRegistry/) -
-- instance-admin grants, per-workspace activation, per-member module
-- permissions, and a module-owned migration tracking table. No actual module
-- ships data through this migration - see /modules/example/migrations/ for
-- the template module's own tables.

CREATE TABLE module_instance_grants (
  id TEXT PRIMARY KEY,
  module_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  granted_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  UNIQUE (module_id, user_id, workspace_id)
);

CREATE TABLE workspace_modules (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  enabled_by TEXT NOT NULL REFERENCES users(id),
  enabled_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, module_id)
);

CREATE TABLE workspace_module_permissions (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  module_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  granted_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, module_id, user_id, permission)
);

CREATE TABLE module_migrations (
  module_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  applied_at TEXT NOT NULL,
  PRIMARY KEY (module_id, filename)
);
