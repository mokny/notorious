import { eq, and } from "drizzle-orm";
import { roleAtLeast, type WorkspaceRole } from "@notorious/shared";
import { db } from "../../db/client.js";
import { workspaceMembers } from "../../db/schema.js";
import { forbidden } from "../../lib/httpError.js";

/** Returns the caller's role in the workspace, or null if they are not a member. */
export async function getMemberRole(
  workspaceId: string,
  userId: string,
): Promise<WorkspaceRole | null> {
  const rows = await db
    .select({ role: workspaceMembers.role })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
    .limit(1);
  return rows[0]?.role ?? null;
}

/** Throws 403 unless the user is a member of the workspace with at least `minRole`. */
export async function requireWorkspaceRole(
  workspaceId: string,
  userId: string,
  minRole: WorkspaceRole,
): Promise<WorkspaceRole> {
  const role = await getMemberRole(workspaceId, userId);
  if (!role || !roleAtLeast(role, minRole)) {
    throw forbidden("You do not have access to this workspace");
  }
  return role;
}
