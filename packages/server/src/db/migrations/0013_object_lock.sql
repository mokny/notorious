-- Lets the workspace owner lock an object against edits (see
-- workspaces/access.ts's lock check and objects/routes.ts's lock endpoint).
-- `locked_at` is the flag itself (NULL = unlocked); `locked_by` is kept
-- alongside purely for display ("locked by Alice"), not for authorization -
-- unlocking requires being the *current* workspace owner, not specifically
-- whoever locked it.
ALTER TABLE objects ADD COLUMN locked_at TEXT;
ALTER TABLE objects ADD COLUMN locked_by TEXT REFERENCES users(id) ON DELETE SET NULL;
