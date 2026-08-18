import { eq, and, ne, isNotNull, inArray, desc, max } from "drizzle-orm";
import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  InviteMemberInput,
  Workspace,
  WorkspaceMember,
  WorkspaceInvite,
} from "@notorious/shared";
import { db } from "../../db/client.js";
import {
  workspaces,
  workspaceMembers,
  workspaceInvites,
  users,
  activityLog,
  objects,
  workspacePins,
  recentlyViewed,
  webauthnCredentials,
} from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { badRequest, notFound } from "../../lib/httpError.js";
import { seedSystemObjectTypes } from "../schema/systemTypes.js";
import { seedDashboardNote, createFallbackDashboardNote } from "./dashboardSeed.js";
import { positionBetween } from "../../lib/position.js";
import { deleteWorkspaceFilesFromDisk } from "../files/service.js";
import { removeWorkspaceFromIndex } from "../search/indexer.js";

/** This user's own workspace list position for a newly-added membership - appended after their current last workspace (see reorderWorkspace/movePin for the same pattern). Exported for the other call sites that insert a workspace_members row directly (auth/service.ts's invite redemption, backup/service.ts's import). */
export async function nextMemberPosition(userId: string): Promise<string> {
  const existing = await db
    .select({ position: workspaceMembers.position })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(desc(workspaceMembers.position))
    .limit(1);
  return positionBetween(existing[0]?.position ?? null, null);
}

export async function createWorkspace(
  ownerId: string,
  input: CreateWorkspaceInput,
): Promise<Workspace> {
  const id = newId();
  const createdAt = nowIso();

  await db.insert(workspaces).values({ id, name: input.name, icon: input.icon, ownerId, createdAt });
  await db.insert(workspaceMembers).values({
    workspaceId: id,
    userId: ownerId,
    role: "owner",
    joinedAt: createdAt,
    position: await nextMemberPosition(ownerId),
  });
  await seedSystemObjectTypes(id);

  // A workspace must always have a dashboard - if the seed-file-based note fails (missing/
  // malformed docs/dashboard-seed.md), fall back to a bare empty note rather than leaving
  // dashboardObjectId null.
  const dashboardObjectId = (await seedDashboardNote(id, ownerId)) ?? (await createFallbackDashboardNote(id, ownerId));
  await db.update(workspaces).set({ dashboardObjectId }).where(eq(workspaces.id, id));

  return {
    id,
    name: input.name,
    icon: input.icon,
    ownerId,
    dashboardObjectId,
    weekStartsOn: "monday",
    coverHeight: 300,
    imageMaxWidth: null,
    imageMaxHeight: null,
    coverMaxWidth: null,
    coverMaxHeight: null,
    imageQuality: 80,
    companyName: null,
    companyCover: null,
    companyBannerHeight: 50,
    companyBannerTextColor: null,
    companyBannerBackgroundColor: null,
    companyBannerBold: false,
    companyBannerItalic: false,
    companyBannerLetterSpacing: false,
    companyBannerTextAlign: "center",
    companyBannerFadeEnabled: true,
    companyBannerGradientEnabled: false,
    companyBannerBackgroundColor2: null,
    companyBannerGradientAngle: 90,
    companyBannerGradientStartPosition: 0,
    companyBannerTextShadow: false,
    companyBannerFontFamily: null,
    companyBannerPosition: "below",
    createdAt,
  };
}

export async function listWorkspacesForUser(userId: string): Promise<Workspace[]> {
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      icon: workspaces.icon,
      ownerId: workspaces.ownerId,
      dashboardObjectId: workspaces.dashboardObjectId,
      weekStartsOn: workspaces.weekStartsOn,
      coverHeight: workspaces.coverHeight,
      imageMaxWidth: workspaces.imageMaxWidth,
      imageMaxHeight: workspaces.imageMaxHeight,
      coverMaxWidth: workspaces.coverMaxWidth,
      coverMaxHeight: workspaces.coverMaxHeight,
      imageQuality: workspaces.imageQuality,
      companyName: workspaces.companyName,
      companyCover: workspaces.companyCover,
      companyBannerHeight: workspaces.companyBannerHeight,
      companyBannerTextColor: workspaces.companyBannerTextColor,
      companyBannerBackgroundColor: workspaces.companyBannerBackgroundColor,
      companyBannerBold: workspaces.companyBannerBold,
      companyBannerItalic: workspaces.companyBannerItalic,
      companyBannerLetterSpacing: workspaces.companyBannerLetterSpacing,
      companyBannerTextAlign: workspaces.companyBannerTextAlign,
      companyBannerFadeEnabled: workspaces.companyBannerFadeEnabled,
      companyBannerGradientEnabled: workspaces.companyBannerGradientEnabled,
      companyBannerBackgroundColor2: workspaces.companyBannerBackgroundColor2,
      companyBannerGradientAngle: workspaces.companyBannerGradientAngle,
      companyBannerGradientStartPosition: workspaces.companyBannerGradientStartPosition,
      companyBannerTextShadow: workspaces.companyBannerTextShadow,
      companyBannerFontFamily: workspaces.companyBannerFontFamily,
      companyBannerPosition: workspaces.companyBannerPosition,
      createdAt: workspaces.createdAt,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(workspaceMembers.position);

  return rows;
}

/** Repositions one of this user's workspaces to just after `afterWorkspaceId` (or first, if null) in their own list - see BlockEditor.tsx's handleDragEnd for why the caller resolves this from a client-side `arrayMove` rather than passing a raw drop target. Personal to this user, unlike movePin. */
export async function reorderWorkspace(
  userId: string,
  workspaceId: string,
  afterWorkspaceId: string | null,
): Promise<void> {
  const rows = await db
    .select({ workspaceId: workspaceMembers.workspaceId, position: workspaceMembers.position })
    .from(workspaceMembers)
    .where(eq(workspaceMembers.userId, userId))
    .orderBy(workspaceMembers.position);

  let newPosition: string;
  if (!afterWorkspaceId) {
    newPosition = positionBetween(null, rows[0]?.position ?? null);
  } else {
    const index = rows.findIndex((row) => row.workspaceId === afterWorkspaceId);
    const after = rows[index];
    const before = rows[index + 1];
    newPosition = positionBetween(after?.position ?? null, before?.position ?? null);
  }

  await db
    .update(workspaceMembers)
    .set({ position: newPosition })
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.workspaceId, workspaceId)));
}

export async function getWorkspace(workspaceId: string): Promise<Workspace> {
  const rows = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const row = rows[0];
  if (!row) throw notFound("Workspace not found");
  return row;
}

export async function updateWorkspace(
  workspaceId: string,
  input: UpdateWorkspaceInput,
): Promise<Workspace> {
  await db.update(workspaces).set(input).where(eq(workspaces.id, workspaceId));
  return getWorkspace(workspaceId);
}

/**
 * Every table that references a workspace (members, invites, object types,
 * properties, objects, blocks, relations, views, files, activity log,
 * pins, saved searches, share links, ...) has `onDelete: cascade` on that
 * foreign key (see db/schema.ts), so a single delete here removes all of it
 * at the SQL level. The two things that *aren't* reachable via a foreign key
 * - files' bytes on disk, and objects' entries in the `objects_fts` search
 * index (an FTS5 virtual table, which can't carry a real FK) - need to be
 * cleaned up explicitly, and before this delete runs: both rely on rows
 * (storage paths, object ids) that the cascade is about to remove.
 */
export async function deleteWorkspace(workspaceId: string): Promise<void> {
  await deleteWorkspaceFilesFromDisk(workspaceId);
  removeWorkspaceFromIndex(workspaceId);
  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
}

export async function listMembers(workspaceId: string): Promise<WorkspaceMember[]> {
  const rows = await db
    .select({
      workspaceId: workspaceMembers.workspaceId,
      userId: workspaceMembers.userId,
      role: workspaceMembers.role,
      joinedAt: workspaceMembers.joinedAt,
      email: users.email,
      name: users.name,
      avatarColor: users.avatarColor,
      avatarUrl: users.avatarUrl,
      createdAt: users.createdAt,
      totpEnabled: users.totpEnabled,
      pushShowWhenOpen: users.pushShowWhenOpen,
      passwordHash: users.passwordHash,
      locale: users.locale,
      contentFontSizeMobile: users.contentFontSizeMobile,
      contentFontSizeDesktop: users.contentFontSizeDesktop,
      isServerAdmin: users.isServerAdmin,
      chatStatus: users.chatStatus,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  // One extra query instead of per-row - avoids an N+1 for `hasPasskey` (see
  // modules/auth/service.ts's `toUser`, which this mirrors for the member list).
  const userIds = rows.map((row) => row.userId);
  const credentialRows = userIds.length
    ? await db.select({ userId: webauthnCredentials.userId }).from(webauthnCredentials).where(inArray(webauthnCredentials.userId, userIds))
    : [];
  const userIdsWithPasskey = new Set(credentialRows.map((row) => row.userId));

  return rows.map((row) => ({
    workspaceId: row.workspaceId,
    userId: row.userId,
    role: row.role,
    joinedAt: row.joinedAt,
    user: {
      id: row.userId,
      email: row.email,
      name: row.name,
      avatarColor: row.avatarColor,
      avatarUrl: row.avatarUrl,
      createdAt: row.createdAt,
      totpEnabled: row.totpEnabled,
      pushShowWhenOpen: row.pushShowWhenOpen,
      hasPassword: row.passwordHash !== null,
      hasPasskey: userIdsWithPasskey.has(row.userId),
      locale: row.locale,
      contentFontSizeMobile: row.contentFontSizeMobile,
      contentFontSizeDesktop: row.contentFontSizeDesktop,
      isServerAdmin: row.isServerAdmin,
      chatStatus: row.chatStatus,
    },
  }));
}

export async function listPendingInvites(workspaceId: string): Promise<WorkspaceInvite[]> {
  return db
    .select()
    .from(workspaceInvites)
    .where(and(eq(workspaceInvites.workspaceId, workspaceId), eq(workspaceInvites.status, "pending")));
}

/**
 * Shares a workspace with another user by email. If that user already has an
 * account they are added as a member immediately; otherwise a pending invite
 * is stored and redeemed automatically the moment they register.
 */
export async function inviteMember(
  workspaceId: string,
  invitedBy: string,
  input: InviteMemberInput,
): Promise<{ status: "added" | "invited" }> {
  const existingUser = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  const createdAt = nowIso();

  if (existingUser[0]) {
    const alreadyMember = await db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, existingUser[0].id)))
      .limit(1);
    if (alreadyMember[0]) throw badRequest("This user is already a member of the workspace");

    await db.insert(workspaceMembers).values({
      workspaceId,
      userId: existingUser[0].id,
      role: input.role,
      joinedAt: createdAt,
      position: await nextMemberPosition(existingUser[0].id),
    });
    return { status: "added" };
  }

  await db.insert(workspaceInvites).values({
    id: newId(),
    workspaceId,
    email: input.email,
    role: input.role,
    invitedBy,
    status: "pending",
    createdAt,
  });
  return { status: "invited" };
}

export async function updateMemberRole(
  workspaceId: string,
  userId: string,
  role: WorkspaceMember["role"],
): Promise<void> {
  const workspace = await getWorkspace(workspaceId);
  if (workspace.ownerId === userId) throw badRequest("Cannot change the owner's role");

  await db
    .update(workspaceMembers)
    .set({ role })
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
}

export async function removeMember(workspaceId: string, userId: string): Promise<void> {
  const workspace = await getWorkspace(workspaceId);
  if (workspace.ownerId === userId) throw badRequest("Cannot remove the workspace owner");

  await db
    .delete(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)));
}

export async function revokeInvite(workspaceId: string, inviteId: string): Promise<void> {
  await db
    .update(workspaceInvites)
    .set({ status: "revoked" })
    .where(and(eq(workspaceInvites.id, inviteId), eq(workspaceInvites.workspaceId, workspaceId), ne(workspaceInvites.status, "accepted")));
}

/**
 * Object ids this user has actually edited in this workspace (object
 * updates, block changes, relation changes - anything recorded via
 * `recordAndBroadcast`), most-recently-edited first. Distinct from "recently
 * viewed" (a purely client-side, per-device list of what was opened) - this
 * is server-side truth about what was *changed*, sourced from the activity
 * log and shared across whichever device the user is on.
 */
export async function listRecentlyEditedObjectIds(
  workspaceId: string,
  actorId: string,
  limit: number,
): Promise<string[]> {
  const rows = await db
    .select({ objectId: activityLog.objectId, lastEditedAt: max(activityLog.createdAt) })
    .from(activityLog)
    .innerJoin(objects, eq(objects.id, activityLog.objectId))
    .where(and(eq(activityLog.workspaceId, workspaceId), eq(activityLog.actorId, actorId), isNotNull(activityLog.objectId)))
    .groupBy(activityLog.objectId)
    .orderBy(desc(max(activityLog.createdAt)))
    .limit(limit);

  return rows.map((row) => row.objectId!);
}

/**
 * Recent activity across the whole workspace (any member's edits), most
 * recent first - powers the AI agent's opt-in `list_recent_activity` tool
 * (see modules/ai/tools.ts), so it can summarize "what's new" on request.
 * Unlike `listRecentlyEditedObjectIds`, not scoped to one actor.
 */
export async function listRecentActivity(
  workspaceId: string,
  limit: number,
): Promise<{ summary: string; action: string; objectId: string | null; createdAt: string }[]> {
  return db
    .select({ summary: activityLog.summary, action: activityLog.action, objectId: activityLog.objectId, createdAt: activityLog.createdAt })
    .from(activityLog)
    .where(eq(activityLog.workspaceId, workspaceId))
    .orderBy(desc(activityLog.createdAt))
    .limit(limit);
}

/** This workspace's pinned objects, in the curated order - a shared "quick navigation" list every member and anonymous share visitor sees the same version of (see workspace_pins in db/schema.ts), not a personal per-account list. */
export async function listPins(workspaceId: string): Promise<string[]> {
  const rows = await db
    .select({ objectId: workspacePins.objectId, position: workspacePins.position })
    .from(workspacePins)
    .where(eq(workspacePins.workspaceId, workspaceId))
    .orderBy(workspacePins.position);
  return rows.map((row) => row.objectId);
}

/** Pins an object at the end of the workspace's list - a no-op if already pinned. */
export async function pinObject(workspaceId: string, objectId: string): Promise<void> {
  const existing = await db
    .select({ position: workspacePins.position })
    .from(workspacePins)
    .where(eq(workspacePins.workspaceId, workspaceId))
    .orderBy(desc(workspacePins.position))
    .limit(1);

  await db
    .insert(workspacePins)
    .values({
      workspaceId,
      objectId,
      position: positionBetween(existing[0]?.position ?? null, null),
      createdAt: nowIso(),
    })
    .onConflictDoNothing();
}

export async function unpinObject(workspaceId: string, objectId: string): Promise<void> {
  await db.delete(workspacePins).where(and(eq(workspacePins.workspaceId, workspaceId), eq(workspacePins.objectId, objectId)));
}

/** Repositions a pinned object to just after `afterObjectId` (or first, if null) - see BlockEditor.tsx's handleDragEnd for why the caller resolves this from a client-side `arrayMove` rather than passing a raw drop target. */
export async function movePin(workspaceId: string, objectId: string, afterObjectId: string | null): Promise<void> {
  const rows = await db
    .select({ objectId: workspacePins.objectId, position: workspacePins.position })
    .from(workspacePins)
    .where(eq(workspacePins.workspaceId, workspaceId))
    .orderBy(workspacePins.position);

  let newPosition: string;
  if (!afterObjectId) {
    newPosition = positionBetween(null, rows[0]?.position ?? null);
  } else {
    const index = rows.findIndex((row) => row.objectId === afterObjectId);
    const after = rows[index];
    const before = rows[index + 1];
    newPosition = positionBetween(after?.position ?? null, before?.position ?? null);
  }

  await db
    .update(workspacePins)
    .set({ position: newPosition })
    .where(and(eq(workspacePins.workspaceId, workspaceId), eq(workspacePins.objectId, objectId)));
}

/** This user's most recently viewed objects in this workspace, most recent first - server-backed for the same cross-device reason as pins. */
export async function listRecentlyViewed(workspaceId: string, userId: string, limit: number): Promise<string[]> {
  const rows = await db
    .select({ objectId: recentlyViewed.objectId })
    .from(recentlyViewed)
    .where(and(eq(recentlyViewed.workspaceId, workspaceId), eq(recentlyViewed.userId, userId)))
    .orderBy(desc(recentlyViewed.viewedAt))
    .limit(limit);
  return rows.map((row) => row.objectId);
}

/** Records/bumps that this user just viewed this object - upserted so there's only ever one row per object, its timestamp refreshed on every open. */
export async function touchRecentlyViewed(workspaceId: string, userId: string, objectId: string): Promise<void> {
  await db
    .insert(recentlyViewed)
    .values({ workspaceId, userId, objectId, viewedAt: nowIso() })
    .onConflictDoUpdate({
      target: [recentlyViewed.workspaceId, recentlyViewed.userId, recentlyViewed.objectId],
      set: { viewedAt: nowIso() },
    });
}

/**
 * This user's most recently active workspace (by their newest recently-viewed row across all
 * workspaces) - drives the "land on my dashboard" redirect at the web app's "/" root. Returns
 * that workspace's dashboard object, or null if the workspace has none (dashboardObjectId is
 * ON DELETE SET NULL, so a deleted dashboard object naturally reads as "none" here) - the caller
 * falls back to the workspace picker in that case. The workspaceMembers join doubles as the
 * access check: a workspace the user is no longer a member of simply won't match.
 */
export async function getLastVisitedWorkspace(userId: string): Promise<{ workspaceId: string; objectId: string } | null> {
  const [row] = await db
    .select({ workspaceId: recentlyViewed.workspaceId, dashboardObjectId: workspaces.dashboardObjectId })
    .from(recentlyViewed)
    .innerJoin(
      workspaceMembers,
      and(eq(workspaceMembers.workspaceId, recentlyViewed.workspaceId), eq(workspaceMembers.userId, recentlyViewed.userId)),
    )
    .innerJoin(workspaces, eq(workspaces.id, recentlyViewed.workspaceId))
    .where(eq(recentlyViewed.userId, userId))
    .orderBy(desc(recentlyViewed.viewedAt))
    .limit(1);
  if (!row?.dashboardObjectId) return null;
  return { workspaceId: row.workspaceId, objectId: row.dashboardObjectId };
}
