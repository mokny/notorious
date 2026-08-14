-- Instance-wide server-admin role (see modules/admin/) - a boolean rather
-- than a multi-level role since "can configure this instance" is all-or-
-- nothing here, unlike per-workspace roles (workspace_members.role).
ALTER TABLE users ADD COLUMN is_server_admin INTEGER NOT NULL DEFAULT 0;

-- Append-only log of security-relevant admin actions (user created/deleted,
-- admin granted/revoked, instance settings changed, update triggered) - see
-- modules/admin/service.ts's `logAdminAction`. No onDelete cascade tie to a
-- specific actor row beyond keeping the id/name pair, same denormalization
-- reasoning as activity_log/block_history (survives the actor's account
-- later being deleted).
CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);
