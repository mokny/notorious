-- Every object type (system or custom, in every existing workspace) gets a
-- universal "sub_objects" relation property, so any object can have child
-- objects of any type - not just the type-specific relations like Task's
-- parent_task/project. New object types get this from application code (see
-- modules/schema/subObjects.ts); this backfills object types that already
-- existed before that code shipped.
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
WHERE NOT EXISTS (
  SELECT 1 FROM properties p WHERE p.object_type_id = ot.id AND p.key = 'sub_objects'
);
