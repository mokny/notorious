-- Comments now default to disabled (the owner opts in per object, via the
-- toolbar icon next to Share - see objects/service.ts's createObject, which
-- now sets this explicitly on every new object instead of relying on the
-- column's own SQL default). Existing objects predate that default flip, so
-- they're backfilled here to match it rather than staying silently enabled.
UPDATE objects SET comments_disabled = 1;

-- One row per notification delivered to a registered user's bell (see
-- modules/notifications/) - currently only ever created for a new comment on
-- an object the recipient owns or has themselves commented on (see
-- modules/comments/service.ts). comment_id cascades with its comment: if the
-- comment's author later hard-deletes their own comment, the notification
-- pointing at it is removed too rather than dangling (a moderated/tombstoned
-- comment is never actually removed, so this only ever fires for an
-- author's own delete). object_title is denormalized at write time so a
-- notification still reads correctly even if the object is later renamed or
-- (via object_id's cascade) deleted entirely.
CREATE TABLE notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  object_title TEXT NOT NULL,
  comment_id TEXT REFERENCES comments(id) ON DELETE CASCADE,
  actor_name TEXT NOT NULL,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX idx_notifications_user ON notifications(user_id, created_at);
