ALTER TABLE workspaces ADD COLUMN dashboard_object_id TEXT REFERENCES objects(id) ON DELETE SET NULL;
