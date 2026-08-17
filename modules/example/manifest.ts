import type { FastifyInstance, FastifyRequest } from "fastify";
import type { Database as SqliteDatabase } from "better-sqlite3";

/**
 * Structural copy of `packages/server/src/modules/moduleRegistry/sdk.ts`'s
 * `ModuleSdk` - kept local (not imported) so this module's own `tsc` build
 * (see `/modules/tsconfig.json`, `rootDir: "."`) never has to reach across
 * into `packages/server/src`. The server always calls `registerRoutes`/
 * `purge` with the real thing; this is only here for type-checking/
 * autocomplete while writing a module.
 */
interface ModuleSdk {
  sqlite: SqliteDatabase;
  requireUser: (request: FastifyRequest) => { id: string; name: string; email: string };
  requireModuleAccess: (request: FastifyRequest, workspaceId: string, permission?: string) => Promise<{ userId: string; role: string }>;
  newId: () => string;
  nowIso: () => string;
}

interface ExampleItemRow {
  id: string;
  workspace_id: string;
  title: string;
  created_at: string;
}

/**
 * Template/reference module - proves the whole SDK end to end (own migrated
 * table, two declared permissions, a small gated CRUD route) and doubles as
 * the copy-paste starting point for a real module. Not enabled anywhere by
 * default; a server admin has to grant it before any workspace owner can
 * turn it on. See /modules/example/web/manifest.tsx for the sidebar/nav
 * side of this same module.
 */
const manifest = {
  id: "example",
  name: "Example",
  description: "Reference module used to verify and demonstrate the module SDK.",
  permissions: [
    { key: "example.view", label: "View example items" },
    { key: "example.manage", label: "Create and delete example items" },
  ],

  registerRoutes(app: FastifyInstance, sdk: ModuleSdk): void {
    app.get("/api/v1/workspaces/:workspaceId/modules/example/items", async (request) => {
      const { workspaceId } = request.params as { workspaceId: string };
      await sdk.requireModuleAccess(request, workspaceId, "example.view");
      const rows = sdk.sqlite
        .prepare("SELECT id, workspace_id, title, created_at FROM example_items WHERE workspace_id = ? ORDER BY created_at DESC")
        .all(workspaceId) as ExampleItemRow[];
      return rows.map((row) => ({ id: row.id, title: row.title, createdAt: row.created_at }));
    });

    app.post("/api/v1/workspaces/:workspaceId/modules/example/items", async (request, reply) => {
      const { workspaceId } = request.params as { workspaceId: string };
      await sdk.requireModuleAccess(request, workspaceId, "example.manage");
      const { title } = request.body as { title?: string };
      if (!title || !title.trim()) {
        reply.code(400);
        return { message: "title is required" };
      }

      const id = sdk.newId();
      const createdAt = sdk.nowIso();
      sdk.sqlite
        .prepare("INSERT INTO example_items (id, workspace_id, title, created_at) VALUES (?, ?, ?, ?)")
        .run(id, workspaceId, title.trim(), createdAt);
      reply.code(201);
      return { id, title: title.trim(), createdAt };
    });

    app.delete("/api/v1/workspaces/:workspaceId/modules/example/items/:id", async (request, reply) => {
      const { workspaceId, id } = request.params as { workspaceId: string; id: string };
      await sdk.requireModuleAccess(request, workspaceId, "example.manage");
      sdk.sqlite.prepare("DELETE FROM example_items WHERE id = ? AND workspace_id = ?").run(id, workspaceId);
      reply.code(204);
    });
  },

  async purge(workspaceId: string, sdk: ModuleSdk): Promise<void> {
    sdk.sqlite.prepare("DELETE FROM example_items WHERE workspace_id = ?").run(workspaceId);
  },
};

export { manifest };
