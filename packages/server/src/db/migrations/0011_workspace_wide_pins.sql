-- Pins turned out to need to be a workspace-wide "quick navigation" list
-- (like the dashboard object) rather than a personal per-user list - an
-- anonymous share visitor has no account for a personal list to belong to,
-- but should still see what's pinned. Recreated without user_id.
DROP TABLE workspace_pins;

CREATE TABLE workspace_pins (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  position TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, object_id)
);

CREATE INDEX idx_workspace_pins_lookup ON workspace_pins(workspace_id, position);
