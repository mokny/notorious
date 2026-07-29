-- Core schema for Notorious. SQLite, one file per instance (see docs/DEPLOYMENT.md
-- for backup instructions: it is just this file plus the files/ directory).

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  avatar_color TEXT NOT NULL DEFAULT '#6366f1',
  created_at TEXT NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'sparkles',
  owner_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);

CREATE TABLE workspace_members (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'commenter', 'editor', 'owner')),
  joined_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);

CREATE TABLE workspace_invites (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'commenter', 'editor')),
  invited_by TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked')),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_workspace_invites_email ON workspace_invites(email);

CREATE TABLE object_types (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT 'file',
  is_system INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (workspace_id, key)
);

CREATE TABLE properties (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  object_type_id TEXT NOT NULL REFERENCES object_types(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  position REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  UNIQUE (object_type_id, key)
);

CREATE TABLE objects (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  object_type_id TEXT NOT NULL REFERENCES object_types(id),
  title TEXT NOT NULL DEFAULT 'Untitled',
  icon TEXT,
  cover TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived_at TEXT
);
CREATE INDEX idx_objects_workspace ON objects(workspace_id, archived_at);
CREATE INDEX idx_objects_type ON objects(object_type_id);

CREATE TABLE object_values (
  object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  value TEXT,
  PRIMARY KEY (object_id, property_id)
);
CREATE INDEX idx_object_values_property ON object_values(property_id, value);

CREATE TABLE relations (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  property_id TEXT NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  source_object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  target_object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (property_id, source_object_id, target_object_id)
);
CREATE INDEX idx_relations_source ON relations(source_object_id);
CREATE INDEX idx_relations_target ON relations(target_object_id);

CREATE TABLE blocks (
  id TEXT PRIMARY KEY,
  object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  parent_block_id TEXT REFERENCES blocks(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '{}',
  position TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_blocks_object ON blocks(object_id, parent_block_id, position);

CREATE TABLE files (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  object_id TEXT REFERENCES objects(id) ON DELETE SET NULL,
  block_id TEXT REFERENCES blocks(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_files_workspace ON files(workspace_id);

CREATE TABLE views (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  object_type_id TEXT REFERENCES object_types(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config TEXT NOT NULL DEFAULT '{}',
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_views_workspace ON views(workspace_id, object_type_id);

CREATE TABLE saved_searches (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  query TEXT NOT NULL DEFAULT '',
  filters TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL
);

CREATE TABLE activity_log (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  object_id TEXT REFERENCES objects(id) ON DELETE SET NULL,
  actor_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_activity_workspace ON activity_log(workspace_id, created_at);

CREATE TABLE push_subscriptions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);

-- Full text search over object titles and their flattened block text. Kept in
-- sync manually by the search module (insert/update/delete alongside the
-- corresponding objects/blocks writes) rather than via FTS5 external-content
-- triggers, since object ids are TEXT (uuid) not INTEGER rowids.
CREATE VIRTUAL TABLE objects_fts USING fts5(
  object_id UNINDEXED,
  title,
  body,
  tokenize = 'trigram'
);
