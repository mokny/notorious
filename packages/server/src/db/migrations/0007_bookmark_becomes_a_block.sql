-- Bookmark is now a block type (embedded inline in documents, see
-- BookmarkBlock), not a standalone object type - undoes what
-- 0006_bookmark_object_type.sql seeded. Objects of that type are deleted
-- first since object_types.id has no ON DELETE CASCADE from objects; deleting
-- the type row afterwards cascades its properties automatically.
DELETE FROM objects WHERE object_type_id IN (SELECT id FROM object_types WHERE key = 'bookmark');
DELETE FROM object_types WHERE key = 'bookmark';
