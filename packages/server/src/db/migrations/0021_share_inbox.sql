CREATE TABLE share_inbox_items (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  url TEXT,
  title TEXT,
  shared_text TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_share_inbox_items_expires_at ON share_inbox_items(expires_at);

CREATE TABLE share_inbox_files (
  id TEXT PRIMARY KEY,
  inbox_item_id TEXT NOT NULL REFERENCES share_inbox_items(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_share_inbox_files_inbox_item_id ON share_inbox_files(inbox_item_id);
