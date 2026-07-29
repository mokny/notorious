import { eq, and, ne, isNotNull, desc, max } from "drizzle-orm";
import type {
  CreateWorkspaceInput,
  UpdateWorkspaceInput,
  InviteMemberInput,
  Workspace,
  WorkspaceMember,
  WorkspaceInvite,
} from "@notorious/shared";
import { db } from "../../db/client.js";
import { workspaces, workspaceMembers, workspaceInvites, users, activityLog, objects } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { badRequest, notFound } from "../../lib/httpError.js";
import { seedSystemObjectTypes } from "../schema/systemTypes.js";

export async function createWorkspace(
  ownerId: string,
  input: CreateWorkspaceInput,
): Promise<Workspace> {
  const id = newId();
  const createdAt = nowIso();

  await db.insert(workspaces).values({ id, name: input.name, icon: input.icon, ownerId, createdAt });
  await db.insert(workspaceMembers).values({ workspaceId: id, userId: ownerId, role: "owner", joinedAt: createdAt });
  await seedSystemObjectTypes(id);

  return { id, name: input.name, icon: input.icon, ownerId, dashboardObjectId: null, createdAt };
}

export async function listWorkspacesForUser(userId: string): Promise<Workspace[]> {
  const rows = await db
    .select({
      id: workspaces.id,
      name: workspaces.name,
      icon: workspaces.icon,
      ownerId: workspaces.ownerId,
      dashboardObjectId: workspaces.dashboardObjectId,
      createdAt: workspaces.createdAt,
    })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaceMembers.workspaceId, workspaces.id))
    .where(eq(workspaceMembers.userId, userId));

  return rows;
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
      createdAt: users.createdAt,
    })
    .from(workspaceMembers)
    .innerJoin(users, eq(workspaceMembers.userId, users.id))
    .where(eq(workspaceMembers.workspaceId, workspaceId));

  return rows.map((row) => ({
    workspaceId: row.workspaceId,
    userId: row.userId,
    role: row.role,
    joinedAt: row.joinedAt,
    user: { id: row.userId, email: row.email, name: row.name, avatarColor: row.avatarColor, createdAt: row.createdAt },
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
