CREATE TABLE workspace_pins (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  position TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id, object_id)
);

CREATE TABLE recently_viewed (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  viewed_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id, object_id)
);

CREATE INDEX idx_workspace_pins_lookup ON workspace_pins(workspace_id, user_id, position);
CREATE INDEX idx_recently_viewed_lookup ON recently_viewed(workspace_id, user_id, viewed_at);
