-- Per-block edit history shown below Properties when a block is selected
-- (see BlockHistoryPanel.tsx) - deliberately separate from `activity_log`,
-- which is per-*object* and already used for a different purpose (the
-- workspace-wide activity feed / push notifications). `block_id` cascades
-- with the block itself: history for a block that no longer exists isn't
-- reachable from anywhere in the UI (you can only view history by clicking
-- an existing block), so there's nothing gained by keeping it around.
-- Trimmed to the 10 most recent rows per block at write time (see
-- recordAndBroadcast) rather than enforced only at read time, so this table
-- never grows unbounded.
CREATE TABLE block_history (
  id TEXT PRIMARY KEY,
  block_id TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  -- Same shape as activity_log's actor_id: always a real user id, even for
  -- an anonymous share-link edit (attributed to whoever created the link -
  -- see resolveActor in workspaces/access.ts). actor_name is a denormalized
  -- copy taken at write time, so a later rename doesn't rewrite history, and
  -- so this table doesn't need a join with `users` just to render a name.
  actor_id TEXT NOT NULL REFERENCES users(id),
  actor_name TEXT NOT NULL,
  action TEXT NOT NULL,
  summary TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_block_history_block ON block_history(block_id, created_at);
