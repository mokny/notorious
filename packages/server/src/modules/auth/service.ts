import argon2 from "argon2";
import { eq, and } from "drizzle-orm";
import type { RegisterInput, LoginInput, ChangePasswordInput, ChangeEmailInput, User } from "@notorious/shared";
import { db } from "../../db/client.js";
import { users, workspaceInvites, workspaceMembers } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { badRequest, unauthorized } from "../../lib/httpError.js";
import { createWorkspace } from "../workspaces/service.js";
import { getRegistrationEnabled } from "../instanceSettings/service.js";

const AVATAR_COLORS = ["#6366f1", "#22c55e", "#f97316", "#ec4899", "#0ea5e9", "#eab308"];

function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarColor: row.avatarColor,
    createdAt: row.createdAt,
    totpEnabled: row.totpEnabled,
  };
}

/**
 * Registers a new user, creates their first personal workspace, and redeems
 * any pending invites addressed to their email so shared workspaces show up
 * immediately after sign-up.
 *
 * Deliberately NOT gated on the self-registration setting here (see
 * modules/instanceSettings) - that only governs the public HTTP endpoint
 * (see auth/routes.ts), not this function itself, which is also how
 * `scripts/createUser.ts` provisions accounts and must always be able to.
 */
export async function registerUser(input: RegisterInput): Promise<User> {
  const existing = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  if (existing[0]) throw badRequest("An account with this email already exists");

  const passwordHash = await argon2.hash(input.password);
  const id = newId();
  const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] ?? "#6366f1";
  const createdAt = nowIso();

  await db.insert(users).values({ id, email: input.email, passwordHash, name: input.name, avatarColor, createdAt });
  await createWorkspace(id, { name: `${input.name}'s Workspace`, icon: "sparkles" });
  await redeemPendingInvites(id, input.email);

  return { id, email: input.email, name: input.name, avatarColor, createdAt, totpEnabled: false };
}

/**
 * Whether `email` is allowed to self-register right now, for the public
 * `POST /api/v1/auth/register` endpoint to check before calling
 * `registerUser` - true if self-registration is enabled instance-wide, or
 * regardless of that setting, if this exact email has a pending workspace
 * invite waiting to be redeemed.
 */
export async function canRegisterEmail(email: string): Promise<boolean> {
  if (await getRegistrationEnabled()) return true;
  const invite = await db
    .select({ id: workspaceInvites.id })
    .from(workspaceInvites)
    .where(and(eq(workspaceInvites.email, email), eq(workspaceInvites.status, "pending")))
    .limit(1);
  return Boolean(invite[0]);
}

async function redeemPendingInvites(userId: string, email: string): Promise<void> {
  const invites = await db
    .select()
    .from(workspaceInvites)
    .where(eq(workspaceInvites.email, email));

  for (const invite of invites) {
    if (invite.status !== "pending") continue;
    await db
      .insert(workspaceMembers)
      .values({ workspaceId: invite.workspaceId, userId, role: invite.role, joinedAt: nowIso() })
      .onConflictDoNothing();
    await db
      .update(workspaceInvites)
      .set({ status: "accepted" })
      .where(eq(workspaceInvites.id, invite.id));
  }
}

export async function verifyCredentials(input: LoginInput): Promise<User> {
  const rows = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  const row = rows[0];
  if (!row) throw unauthorized("Invalid email or password");

  const valid = await argon2.verify(row.passwordHash, input.password);
  if (!valid) throw unauthorized("Invalid email or password");

  return toUser(row);
}

export async function getUserById(id: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ? toUser(rows[0]) : null;
}

/** Requires the current password, same as `changeEmail` - this changes how the account is authenticated, not a profile detail. */
export async function changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const row = rows[0];
  if (!row) throw unauthorized();

  const valid = await argon2.verify(row.passwordHash, input.currentPassword);
  if (!valid) throw badRequest("Current password is incorrect");

  const passwordHash = await argon2.hash(input.newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

export async function changeEmail(userId: string, input: ChangeEmailInput): Promise<User> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const row = rows[0];
  if (!row) throw unauthorized();

  const valid = await argon2.verify(row.passwordHash, input.currentPassword);
  if (!valid) throw badRequest("Current password is incorrect");

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.newEmail)).limit(1);
  if (existing[0] && existing[0].id !== userId) throw badRequest("An account with this email already exists");

  await db.update(users).set({ email: input.newEmail }).where(eq(users.id, userId));
  return toUser({ ...row, email: input.newEmail });
}
