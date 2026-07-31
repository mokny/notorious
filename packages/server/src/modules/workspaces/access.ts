import { eq, and } from "drizzle-orm";
import { roleAtLeast, type WorkspaceRole } from "@notorious/shared";
import type { FastifyRequest } from "fastify";
import { db } from "../../db/client.js";
import { workspaceMembers } from "../../db/schema.js";
import { forbidden, unauthorized } from "../../lib/httpError.js";
import { assertObjectEditable } from "../objects/service.js";
import { requireUser } from "../../plugins/session.js";

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

export interface AccessResult {
  /** The acting user's id, or null when access came from an anonymous share link (nothing to attribute the change to). */
  actorId: string | null;
  actorName: string | null;
}

interface RequireAccessOptions {
  /** When set, a single-object share must match this exact object to be allowed through. Whole-workspace shares always pass. Omit for endpoints where the resource itself isn't object-scoped (e.g. schema lookups). */
  objectId?: string;
  /** When true, only a real member or a whole-workspace share (never a single-object share) may pass - for endpoints that browse/list across the workspace. */
  requireWorkspaceScope?: boolean;
  /** When true, skip the object-lock check even though this call would normally trigger it - for the narrow set of actions the lock is deliberately scoped to exclude (e.g. checking off a checklist item; see objects/routes.ts's lock endpoint and toggleChecklistItemSchema). Still requires normal role/membership access. */
  allowWhenLocked?: boolean;
}

/**
 * Authorizes `workspaceId` at `minRole` via either real workspace membership
 * or an attached share link (`request.shareAccess`, see plugins/session.ts).
 * This is the one chokepoint that lets a small set of routes serve both
 * logged-in members and anonymous share-link visitors without duplicating
 * their business logic in a parallel "public" API.
 */
export async function requireAccess(
  request: FastifyRequest,
  workspaceId: string,
  minRole: WorkspaceRole,
  options: RequireAccessOptions = {},
): Promise<AccessResult> {
  let result: AccessResult;

  if (request.user) {
    await requireWorkspaceRole(workspaceId, request.user.id, minRole);
    result = { actorId: request.user.id, actorName: request.user.name };
  } else {
    const share = request.shareAccess;
    const scopeOk =
      share &&
      share.workspaceId === workspaceId &&
      roleAtLeast(share.role, minRole) &&
      (!options.requireWorkspaceScope || share.objectId === null) &&
      (options.objectId === undefined || share.objectId === null || share.objectId === options.objectId);

    if (!scopeOk) throw unauthorized();
    result = { actorId: null, actorName: null };
  }

  // Locking blocks edits from *everyone*, including the workspace owner
  // (see objects/routes.ts's lock endpoint) - "editor" is the lowest role
  // any mutating route asks for here, so this only ever runs for a request
  // that's actually trying to change something, never a plain read.
  if (options.objectId && roleAtLeast(minRole, "editor") && !options.allowWhenLocked) {
    await assertObjectEditable(options.objectId);
  }

  return result;
}

/** Shorthand for `requireAccess` on endpoints that browse/list across a whole workspace - never satisfiable by a single-object share. */
export function requireWorkspaceScopedAccess(
  request: FastifyRequest,
  workspaceId: string,
  minRole: WorkspaceRole,
): Promise<AccessResult> {
  return requireAccess(request, workspaceId, minRole, { requireWorkspaceScope: true });
}

/**
 * Like `requireAccess` but for the small set of actions deliberately kept
 * off anonymous share links entirely, even editor-role ones - server-side
 * script authoring/execution (see modules/scripting/). Every other route
 * that reaches `requireAccess` treats "real member" and "attached share
 * link" as interchangeable by design (see that function's own doc comment);
 * this is the one boundary in the app that isn't, so it goes through
 * `requireUser`/`requireWorkspaceRole` directly instead of accepting
 * `request.shareAccess` at all.
 */
export async function requireRealMemberAccess(
  request: FastifyRequest,
  workspaceId: string,
  minRole: WorkspaceRole,
  objectId?: string,
): Promise<{ actorId: string; actorName: string }> {
  const user = requireUser(request);
  await requireWorkspaceRole(workspaceId, user.id, minRole);
  if (objectId && roleAtLeast(minRole, "editor")) {
    await assertObjectEditable(objectId);
  }
  return { actorId: user.id, actorName: user.name };
}

/**
 * Who to attribute an audit-log entry/realtime broadcast to. A real member
 * attributes to themselves; an anonymous share-link visitor has no account,
 * so their edits are attributed to whoever created that link - same
 * reasoning as file uploads (see modules/files/routes.ts). Without this,
 * changes an anonymous editor makes would need to skip the broadcast
 * entirely, and every *other* viewer of that link (including the owner)
 * would stop seeing live updates from that visitor.
 */
export function resolveActor(request: FastifyRequest, access: AccessResult): { actorId: string; actorName: string } {
  if (access.actorId) return { actorId: access.actorId, actorName: access.actorName! };
  return { actorId: request.shareAccess!.createdBy, actorName: "Someone via a shared link" };
}
