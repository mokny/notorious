import type { FastifyRequest } from "fastify";
import type { WorkspaceRole } from "@notorious/shared";
import { db } from "../../db/client.js";
import { sqlite } from "../../db/client.js";
import { newId, nowIso } from "../../lib/ids.js";
import { requireUser, type AuthenticatedUser } from "../../plugins/session.js";
import { requireModuleAccess } from "./access.js";

/**
 * What `/modules/<id>/manifest.ts` gets passed into `registerRoutes`/`purge`
 * instead of importing server internals directly - modules live outside
 * `packages/server/src` (by design, see CLAUDE.md's module-system design
 * notes) and are compiled independently, so reaching back into the server's
 * own `src` tree with a relative import wouldn't resolve under a module's
 * own `rootDir`. This is the whole SDK surface for now: raw SQLite access
 * for a module's own tables (drizzle's typed `db` only knows about
 * `db/schema.ts`'s core tables, not a module's), a read path into the core
 * schema when a module needs to join against users/workspaces, id/timestamp
 * helpers matching the rest of the app's conventions, and `requireModuleAccess`
 * pre-bound to this module's id so a module's own routes gate themselves the
 * same way every other route in the app does.
 */
export interface ModuleSdk {
  /** Raw better-sqlite3 handle - use this for a module's own tables (drizzle's `db` only has typed entries for core tables). */
  sqlite: typeof sqlite;
  /** Drizzle client, typed against the core schema - for reading users/workspaces/etc, not this module's own tables. */
  db: typeof db;
  newId: typeof newId;
  nowIso: typeof nowIso;
  requireUser: (request: FastifyRequest) => AuthenticatedUser;
  /** Same as moduleRegistry/access.ts's `requireModuleAccess`, with `moduleId` already bound to this module. */
  requireModuleAccess: (request: FastifyRequest, workspaceId: string, permission?: string) => Promise<{ userId: string; role: WorkspaceRole }>;
}

export function createModuleSdk(moduleId: string): ModuleSdk {
  return {
    sqlite,
    db,
    newId,
    nowIso,
    requireUser,
    requireModuleAccess: (request, workspaceId, permission) => requireModuleAccess(request, workspaceId, moduleId, permission),
  };
}
