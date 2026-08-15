-- Admin-only, workspace-agnostic notification bell - see
-- modules/admin/service.ts's `notifyAllAdmins` and db/schema.ts's
-- `adminNotifications` doc comment for why this can't reuse `notifications`.
CREATE TABLE admin_notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  url TEXT NOT NULL,
  created_at TEXT NOT NULL,
  read_at TEXT
);

CREATE INDEX idx_admin_notifications_user_id ON admin_notifications(user_id);
