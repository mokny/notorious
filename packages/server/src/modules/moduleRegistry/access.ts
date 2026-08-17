import { eq, and } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import type { WorkspaceRole } from "@notorious/shared";
import { db } from "../../db/client.js";
import { workspaceModules, workspaceModulePermissions } from "../../db/schema.js";
import { forbidden } from "../../lib/httpError.js";
import { requireUser } from "../../plugins/session.js";
import { requireWorkspaceRole } from "../workspaces/access.js";

/**
 * Throws 403 unless `moduleId` is enabled for `workspaceId` and the caller
 * may use it - the workspace owner always may (implicitly holds every
 * permission a module declares, see moduleRegistry/service.ts's doc
 * comment), anyone else needs an explicit `workspace_module_permissions` row
 * for `permission` (when given). Mirrors workspaces/access.ts's
 * `requireAccess` as the one chokepoint for module routes, but modules are
 * never reachable via an anonymous share link - there's no per-object share
 * scope for a module route to check against, only real workspace membership.
 */
export async function requireModuleAccess(
  request: FastifyRequest,
  workspaceId: string,
  moduleId: string,
  permission?: string,
): Promise<{ userId: string; role: WorkspaceRole }> {
  const user = requireUser(request);
  const role = await requireWorkspaceRole(workspaceId, user.id, "viewer");

  const enabledRows = await db
    .select({ workspaceId: workspaceModules.workspaceId })
    .from(workspaceModules)
    .where(and(eq(workspaceModules.workspaceId, workspaceId), eq(workspaceModules.moduleId, moduleId)))
    .limit(1);
  if (!enabledRows[0]) throw forbidden("This module isn't enabled for this workspace");

  if (role === "owner" || !permission) return { userId: user.id, role };

  const grantRows = await db
    .select({ permission: workspaceModulePermissions.permission })
    .from(workspaceModulePermissions)
    .where(
      and(
        eq(workspaceModulePermissions.workspaceId, workspaceId),
        eq(workspaceModulePermissions.moduleId, moduleId),
        eq(workspaceModulePermissions.userId, user.id),
        eq(workspaceModulePermissions.permission, permission),
      ),
    )
    .limit(1);
  if (!grantRows[0]) throw forbidden("You do not have this module permission");

  return { userId: user.id, role };
}
