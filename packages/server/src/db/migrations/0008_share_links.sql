CREATE TABLE share_links (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  object_id TEXT REFERENCES objects(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL,
  expires_at TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_share_links_token ON share_links(token);
CREATE INDEX idx_share_links_workspace ON share_links(workspace_id, object_id);
