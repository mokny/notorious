-- Which weekday Week/Month calendar views start on (see modules/workspaces/) -
-- a workspace-wide setting so every member's calendar block lines up the same way.
ALTER TABLE workspaces ADD COLUMN week_starts_on TEXT NOT NULL DEFAULT 'monday';
