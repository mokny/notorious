-- Adds the "Bookmark" system object type (and its default properties) to
-- every workspace that was created before this type existed.
INSERT INTO object_types (id, workspace_id, key, name, icon, is_system, created_at)
SELECT lower(hex(randomblob(16))), w.id, 'bookmark', 'Bookmark', 'bookmark', 1, datetime('now')
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM object_types ot WHERE ot.workspace_id = w.id AND ot.key = 'bookmark'
);

INSERT INTO properties (id, workspace_id, object_type_id, key, name, type, config, position, created_at)
SELECT lower(hex(randomblob(16))), ot.workspace_id, ot.id, 'url', 'URL', 'url', '{"type":"url"}', 0, datetime('now')
FROM object_types ot
WHERE ot.key = 'bookmark'
AND NOT EXISTS (
  SELECT 1 FROM properties p WHERE p.object_type_id = ot.id AND p.key = 'url'
);

INSERT INTO properties (id, workspace_id, object_type_id, key, name, type, config, position, created_at)
SELECT lower(hex(randomblob(16))), ot.workspace_id, ot.id, 'description', 'Description', 'text', '{"type":"text"}', 1, datetime('now')
FROM object_types ot
WHERE ot.key = 'bookmark'
AND NOT EXISTS (
  SELECT 1 FROM properties p WHERE p.object_type_id = ot.id AND p.key = 'description'
);

INSERT INTO properties (id, workspace_id, object_type_id, key, name, type, config, position, created_at)
SELECT lower(hex(randomblob(16))), ot.workspace_id, ot.id, 'sub_objects', 'Sub-objects', 'relation', '{"type":"relation","targetObjectTypeId":null,"twoWay":true}', 9999, datetime('now')
FROM object_types ot
WHERE ot.key = 'bookmark'
AND NOT EXISTS (
  SELECT 1 FROM properties p WHERE p.object_type_id = ot.id AND p.key = 'sub_objects'
);
