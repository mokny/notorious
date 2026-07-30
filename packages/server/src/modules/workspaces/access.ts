import { eq, and } from "drizzle-orm";
import { roleAtLeast, type WorkspaceRole } from "@notorious/shared";
import type { FastifyRequest } from "fastify";
import { db } from "../../db/client.js";
import { workspaceMembers } from "../../db/schema.js";
import { forbidden, unauthorized } from "../../lib/httpError.js";

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
  if (request.user) {
    await requireWorkspaceRole(workspaceId, request.user.id, minRole);
    return { actorId: request.user.id, actorName: request.user.name };
  }

  const share = request.shareAccess;
  const scopeOk =
    share &&
    share.workspaceId === workspaceId &&
    roleAtLeast(share.role, minRole) &&
    (!options.requireWorkspaceScope || share.objectId === null) &&
    (options.objectId === undefined || share.objectId === null || share.objectId === options.objectId);

  if (!scopeOk) throw unauthorized();
  return { actorId: null, actorName: null };
}

/** Shorthand for `requireAccess` on endpoints that browse/list across a whole workspace - never satisfiable by a single-object share. */
export function requireWorkspaceScopedAccess(
  request: FastifyRequest,
  workspaceId: string,
  minRole: WorkspaceRole,
): Promise<AccessResult> {
  return requireAccess(request, workspaceId, minRole, { requireWorkspaceScope: true });
}
