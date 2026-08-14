-- Lets each user drag-reorder their own workspace list (left rail + workspace
-- picker) - see modules/workspaces/service.ts's reorderWorkspace. A personal
-- per-(workspace, user) position, not a workspace-wide one like
-- workspace_pins.position, since this ordering is one person's preference,
-- not something every member shares. SQLite has no ALTER COLUMN, so the NOT
-- NULL `position` column is added via the standard rebuild-and-rename dance
-- (see 0041_passkey_only_registration.sql), backfilling existing rows with a
-- single-digit fractional-indexing key (see lib/position.ts) ranked by
-- joined_at per user, so the migration doesn't visibly reorder anyone's
-- existing list. A single base62 digit covers up to 62 workspaces for one
-- user, comfortably more than a self-hosted instance will ever see; any
-- further row simply collides on 'a' and sorts arbitrarily among its peers
-- until the next real drag resolves it via a fresh generateKeyBetween call.
CREATE TABLE workspace_members_new (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  joined_at TEXT NOT NULL,
  position TEXT NOT NULL,
  PRIMARY KEY (workspace_id, user_id)
);

INSERT INTO workspace_members_new (workspace_id, user_id, role, joined_at, position)
SELECT
  wm.workspace_id,
  wm.user_id,
  wm.role,
  wm.joined_at,
  'a' || substr(
    '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz',
    (
      SELECT COUNT(*) FROM workspace_members AS wm2
      WHERE wm2.user_id = wm.user_id
        AND (wm2.joined_at < wm.joined_at
             OR (wm2.joined_at = wm.joined_at AND wm2.workspace_id < wm.workspace_id))
    ) + 1,
    1
  )
FROM workspace_members AS wm;

DROP TABLE workspace_members;
ALTER TABLE workspace_members_new RENAME TO workspace_members;

CREATE INDEX idx_workspace_members_user_position ON workspace_members(user_id, position);
