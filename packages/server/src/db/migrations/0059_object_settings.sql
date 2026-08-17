-- Owner-configurable per-object access overrides, set via the "Object
-- Settings" dialog (see components/ObjectSettingsDialog.tsx). ownerOnlyEdit
-- restricts edits to the workspace owner regardless of an editor's role;
-- allowApiEditsOverride lets an apiKey/MCP request bypass that restriction
-- (and/or an active lock) even though the UI still blocks it - see
-- workspaces/access.ts's `requireAccess` and objects/service.ts's
-- `assertObjectEditable`.
ALTER TABLE objects ADD COLUMN owner_only_edit INTEGER NOT NULL DEFAULT 0;
ALTER TABLE objects ADD COLUMN allow_api_edits_override INTEGER NOT NULL DEFAULT 0;
