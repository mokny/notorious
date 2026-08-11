ALTER TABLE workspaces ADD COLUMN image_max_width INTEGER;
ALTER TABLE workspaces ADD COLUMN image_max_height INTEGER;
ALTER TABLE workspaces ADD COLUMN cover_max_width INTEGER;
ALTER TABLE workspaces ADD COLUMN cover_max_height INTEGER;
ALTER TABLE workspaces ADD COLUMN image_quality INTEGER NOT NULL DEFAULT 80;
