-- Owner-only kill-switch for the comments feature on one object (see
-- modules/comments/) - independent of objects.locked_at, so comments stay
-- postable on a locked object unless this is also set.
ALTER TABLE objects ADD COLUMN comments_disabled INTEGER NOT NULL DEFAULT 0;

-- One row per comment. author_id is nullable (ON DELETE SET NULL, not
-- CASCADE) so a comment survives its author's account being deleted -
-- author_name is denormalized at write time for the same reason
-- block_history.actor_name is (see 0014_block_history.sql), and doubles as
-- the anonymous-share-visitor label when author_id is null (see
-- workspaces/access.ts's resolveActor).
--
-- deleted_at/deleted_by_name implement moderation deletes as a tombstone
-- instead of a row removal: an owner/editor deleting *someone else's*
-- comment sets these and the body/author fields are left in place, so the
-- thread keeps showing who wrote what and who removed it. An author deleting
-- their own comment just removes the row - see modules/comments/service.ts.
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  deleted_at TEXT,
  deleted_by_name TEXT
);
CREATE INDEX idx_comments_object ON comments(object_id, created_at);
