ALTER TABLE blocks ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX blocks_object_slug_idx ON blocks(object_id, slug) WHERE slug IS NOT NULL;

ALTER TABLE objects ADD COLUMN slug TEXT;
CREATE UNIQUE INDEX objects_workspace_slug_idx ON objects(workspace_id, slug) WHERE slug IS NOT NULL;
