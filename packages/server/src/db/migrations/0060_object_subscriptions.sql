-- Explicit per-object subscriptions (see modules/subscriptions/) - a member
-- opts in via a toolbar/menu button, no auto-subscribe on create/comment.
CREATE TABLE object_subscriptions (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  UNIQUE (object_id, user_id)
);

CREATE INDEX idx_object_subscriptions_user_id ON object_subscriptions(user_id);

-- Debounce window for subscription notifications - one row per (object,
-- subscriber) currently pending, bumped forward on every new activity and
-- deleted once delivered (see modules/subscriptions/scheduler.ts).
CREATE TABLE pending_subscription_notifications (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  object_id TEXT NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_actor_id TEXT NOT NULL REFERENCES users(id),
  change_count INTEGER NOT NULL DEFAULT 1,
  due_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (object_id, user_id)
);

CREATE INDEX idx_pending_subscription_notifications_due_at ON pending_subscription_notifications(due_at);
