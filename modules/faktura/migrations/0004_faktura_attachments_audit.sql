-- Faktura module - free-form file attachments and the immutable audit log.

-- Uses the shared storage primitives (writeUploadedBytes/deleteUploadedBytes
-- in packages/server/src/lib/storage.ts) directly, not the core `files`
-- table - that table requires a non-null workspace_id FK and is coupled to
-- the core Object system, neither of which fits a module's own entities
-- (precedent: the `chat` module does the same).
CREATE TABLE faktura_attachments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('customer', 'order')),
  entity_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_faktura_attachments_entity ON faktura_attachments(entity_type, entity_id);

-- Immutable log of every mutation across Faktura entities - no update/delete
-- path is ever exposed for rows here. Modeled conceptually after
-- packages/server/src/modules/realtime/activity.ts's shape (actor/action/
-- summary/entity) but independent of it: that table is coupled to the core
-- Object system's realtime-broadcast/webhook/automation pipeline, none of
-- which applies to this module's own entities.
CREATE TABLE faktura_audit_log (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  diff_json TEXT,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_faktura_audit_log_workspace_id ON faktura_audit_log(workspace_id);
CREATE INDEX idx_faktura_audit_log_entity ON faktura_audit_log(entity_type, entity_id);
