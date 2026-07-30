-- Whiteboard: new system object type - a drawing/sketching canvas (shapes,
-- text, freehand, arrows - see the "whiteboard" block type), usable both as
-- its own dedicated object and embedded as a block in any other object. New
-- workspaces get it from seedSystemObjectTypes(); this backfills workspaces
-- that already existed before this shipped (same pattern as
-- migrations/0004_universal_sub_objects.sql).
INSERT INTO object_types (id, workspace_id, key, name, icon, is_system, created_at)
SELECT lower(hex(randomblob(16))), w.id, 'whiteboard', 'Whiteboard', 'whiteboard', 1, datetime('now')
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM object_types ot WHERE ot.workspace_id = w.id AND ot.key = 'whiteboard'
);

INSERT INTO properties (id, workspace_id, object_type_id, key, name, type, config, position, created_at)
SELECT
  lower(hex(randomblob(16))),
  ot.workspace_id,
  ot.id,
  'sub_objects',
  'Sub-objects',
  'relation',
  '{"type":"relation","targetObjectTypeId":null,"twoWay":true}',
  9999,
  datetime('now')
FROM object_types ot
WHERE ot.key = 'whiteboard'
AND NOT EXISTS (
  SELECT 1 FROM properties p WHERE p.object_type_id = ot.id AND p.key = 'sub_objects'
);
