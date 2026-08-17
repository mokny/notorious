-- Reference module's own table - see manifest.ts. Deliberately no FK against
-- the core `workspaces` table: module migrations run independently of core
-- ones (tracked in `module_migrations`, see db/migrate.ts), so a strict FK
-- here would depend on ordering guarantees the module system doesn't make.
CREATE TABLE example_items (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL,
  title TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_example_items_workspace_id ON example_items(workspace_id);
