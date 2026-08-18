-- Defense-in-depth: block deleting an object that is currently set as its
-- workspace's dashboard, no matter which code path the DELETE comes through.
-- The app layer (modules/objects/service.ts's deleteObject/archiveObject)
-- already rejects this with a friendly 400 - this trigger is the backstop
-- for anything that skips that check. Workspace deletion is unaffected: it
-- deletes the `workspaces` row first, so by the time the cascade reaches
-- this object the WHEN clause's EXISTS no longer matches.
CREATE TRIGGER prevent_dashboard_object_delete
BEFORE DELETE ON objects
FOR EACH ROW
WHEN EXISTS (SELECT 1 FROM workspaces WHERE dashboard_object_id = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'Cannot delete the workspace dashboard object');
END;
