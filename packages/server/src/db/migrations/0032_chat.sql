-- Chat feature: conversations (workspace channels, open/joinable by any
-- member, and workspace-agnostic DMs/free-form groups reachable by email,
-- no confirmation flow) - see modules/chat/. workspace_id is null for dms.
-- last_message_at is denormalized (bumped on every send) so the unified
-- conversation list can sort by activity without a join+aggregate.
CREATE TABLE conversations (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  workspace_id TEXT REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT,
  created_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  last_message_at TEXT
);
CREATE INDEX idx_conversations_workspace ON conversations(workspace_id);
CREATE INDEX idx_conversations_last_message ON conversations(last_message_at);

-- last_read_message_id is a cheap per-participant "read up to here" cursor,
-- driving unread counts / the app-icon badge without scanning
-- message_read_receipts (see that table below for why it exists separately).
CREATE TABLE conversation_participants (
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL,
  last_read_message_id TEXT,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX idx_conversation_participants_user ON conversation_participants(user_id);

-- deleted_at is a soft-delete (own messages only) - the row is kept for
-- thread ordering/read-receipt integrity, the DTO mapper nulls out
-- body/attachments once set.
CREATE TABLE messages (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);

-- message_id starts null - attachments are uploaded before the message they
-- belong to exists, then linked by id via the send request's attachmentIds.
-- conversation_id is denormalized so a pending (unlinked) upload can still be
-- scoped/authorized without a message row to join through.
CREATE TABLE message_attachments (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id TEXT REFERENCES messages(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  uploaded_by TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_message_attachments_message ON message_attachments(message_id);
CREATE INDEX idx_message_attachments_conversation ON message_attachments(conversation_id);

CREATE TABLE message_reactions (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id, emoji)
);

-- Kept separate from conversation_participants.last_read_message_id because
-- per-message "who has read this" (receipt avatars) can't be cleanly derived
-- from a single cursor comparison across participants who joined at
-- different times.
CREATE TABLE message_read_receipts (
  message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  read_at TEXT NOT NULL,
  PRIMARY KEY (message_id, user_id)
);

-- Full text search over message bodies, kept in sync manually by the chat
-- module (see modules/chat/indexer.ts), same convention as objects_fts
-- (0001_init.sql) - kept as a separate table rather than folding into
-- objects_fts because messages (especially DMs) have no workspace_id/objects
-- row for objects_fts's existing join-to-objects query path to use.
CREATE VIRTUAL TABLE messages_fts USING fts5(
  message_id UNINDEXED,
  body,
  tokenize = 'trigram'
);
