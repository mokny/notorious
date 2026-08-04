-- Adds the "Variable" system object type (and its default properties) to
-- every workspace that was created before this type existed. New workspaces
-- get it from seedSystemObjectTypes(); this backfills the rest (same pattern
-- as migrations/0006_bookmark_object_type.sql / 0012_whiteboard_object_type.sql).
-- Unlike other system types, Variable deliberately has no `sub_objects`
-- relation property - it's a leaf coding-only value, not a container.
INSERT INTO object_types (id, workspace_id, key, name, icon, is_system, created_at)
SELECT lower(hex(randomblob(16))), w.id, 'variable', 'Variable', 'braces', 1, datetime('now')
FROM workspaces w
WHERE NOT EXISTS (
  SELECT 1 FROM object_types ot WHERE ot.workspace_id = w.id AND ot.key = 'variable'
);

INSERT INTO properties (id, workspace_id, object_type_id, key, name, type, config, position, created_at)
SELECT
  lower(hex(randomblob(16))),
  ot.workspace_id,
  ot.id,
  'valueType',
  'Value Type',
  'select',
  '{"type":"select","options":[' ||
    '{"id":"' || lower(hex(randomblob(16))) || '","label":"Int","color":"#3b82f6"},' ||
    '{"id":"' || lower(hex(randomblob(16))) || '","label":"Float","color":"#8b5cf6"},' ||
    '{"id":"' || lower(hex(randomblob(16))) || '","label":"String","color":"#22c55e"},' ||
    '{"id":"' || lower(hex(randomblob(16))) || '","label":"Bool","color":"#f59e0b"},' ||
    '{"id":"' || lower(hex(randomblob(16))) || '","label":"Date","color":"#ec4899"},' ||
    '{"id":"' || lower(hex(randomblob(16))) || '","label":"List","color":"#06b6d4"},' ||
    '{"id":"' || lower(hex(randomblob(16))) || '","label":"JSON","color":"#64748b"}' ||
  ']}',
  0,
  datetime('now')
FROM object_types ot
WHERE ot.key = 'variable'
AND NOT EXISTS (
  SELECT 1 FROM properties p WHERE p.object_type_id = ot.id AND p.key = 'valueType'
);

INSERT INTO properties (id, workspace_id, object_type_id, key, name, type, config, position, created_at)
SELECT lower(hex(randomblob(16))), ot.workspace_id, ot.id, 'template', 'Template', 'text', '{"type":"text"}', 1, datetime('now')
FROM object_types ot
WHERE ot.key = 'variable'
AND NOT EXISTS (
  SELECT 1 FROM properties p WHERE p.object_type_id = ot.id AND p.key = 'template'
);
