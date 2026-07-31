import { randomBytes } from "node:crypto";
import { eq, and, isNull, or, gt } from "drizzle-orm";
import type { ShareLink, ShareLinkSummary, CreateShareLinkInput, WorkspaceRole } from "@notorious/shared";
import { db } from "../../db/client.js";
import { shareLinks, objects } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { notFound } from "../../lib/httpError.js";

function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export async function createShareLink(
  workspaceId: string,
  createdBy: string,
  input: CreateShareLinkInput,
): Promise<ShareLink> {
  const id = newId();
  const token = generateToken();
  const createdAt = nowIso();

  await db.insert(shareLinks).values({
    id,
    workspaceId,
    objectId: input.objectId,
    token,
    role: input.role,
    expiresAt: input.expiresAt,
    createdBy,
    createdAt,
  });

  return { id, workspaceId, objectId: input.objectId, token, role: input.role, expiresAt: input.expiresAt, createdBy, createdAt };
}

/** `objectId: null` lists the workspace-wide links; a specific id lists that object's links. */
export async function listShareLinks(workspaceId: string, objectId: string | null): Promise<ShareLink[]> {
  const scopeCondition = objectId === null ? isNull(shareLinks.objectId) : eq(shareLinks.objectId, objectId);
  return db
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.workspaceId, workspaceId), scopeCondition));
}

/**
 * Every currently-active (non-expired) share link in the workspace, whole-
 * workspace and per-object alike, newest first - for the Settings page's
 * consolidated "Public sharing" list (see ShareDialog.tsx's own per-scope
 * list for the create/manage flow this complements, not replaces). Deleted
 * outright rather than soft-expired (see `revokeShareLink`), so "active"
 * here just means "not past its own `expiresAt`" - an expired-but-not-yet-
 * revoked row is filtered out rather than shown as stale.
 */
export async function listActiveShareLinksForWorkspace(workspaceId: string): Promise<ShareLinkSummary[]> {
  const rows = await db
    .select({
      id: shareLinks.id,
      workspaceId: shareLinks.workspaceId,
      objectId: shareLinks.objectId,
      token: shareLinks.token,
      role: shareLinks.role,
      expiresAt: shareLinks.expiresAt,
      createdBy: shareLinks.createdBy,
      createdAt: shareLinks.createdAt,
      objectTitle: objects.title,
    })
    .from(shareLinks)
    .leftJoin(objects, eq(shareLinks.objectId, objects.id))
    .where(
      and(
        eq(shareLinks.workspaceId, workspaceId),
        or(isNull(shareLinks.expiresAt), gt(shareLinks.expiresAt, nowIso())),
      ),
    )
    .orderBy(shareLinks.createdAt);

  return rows.map((row) => ({ ...row, objectTitle: row.objectId ? (row.objectTitle ?? "Untitled") : null }));
}

export async function revokeShareLink(workspaceId: string, id: string): Promise<void> {
  await db.delete(shareLinks).where(and(eq(shareLinks.id, id), eq(shareLinks.workspaceId, workspaceId)));
}

export interface ResolvedShare {
  id: string;
  workspaceId: string;
  objectId: string | null;
  role: WorkspaceRole;
  createdBy: string;
}

/** Looks up a token, treating an expired link exactly like a nonexistent one. */
export async function resolveShareToken(token: string): Promise<ResolvedShare | null> {
  const rows = await db.select().from(shareLinks).where(eq(shareLinks.token, token)).limit(1);
  const row = rows[0];
  if (!row) return null;
  if (row.expiresAt && row.expiresAt <= nowIso()) return null;
  return { id: row.id, workspaceId: row.workspaceId, objectId: row.objectId, role: row.role, createdBy: row.createdBy };
}

/**
 * Throws unless `objectId` is something this share is allowed to touch: for a
 * single-object share, only that exact object; for a whole-workspace share,
 * anything belonging to that workspace.
 */
export async function assertShareCanAccessObject(share: ResolvedShare, objectId: string): Promise<void> {
  if (share.objectId !== null) {
    if (share.objectId !== objectId) throw notFound("Object not found");
    return;
  }
  const rows = await db.select({ workspaceId: objects.workspaceId }).from(objects).where(eq(objects.id, objectId)).limit(1);
  if (!rows[0] || rows[0].workspaceId !== share.workspaceId) throw notFound("Object not found");
}
