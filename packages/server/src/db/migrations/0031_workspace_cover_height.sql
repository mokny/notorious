-- Max height (px) object cover banners are cropped to in this workspace -
-- an owner/editor-configurable workspace-wide setting (see modules/workspaces/).
ALTER TABLE workspaces ADD COLUMN cover_height INTEGER NOT NULL DEFAULT 300;
