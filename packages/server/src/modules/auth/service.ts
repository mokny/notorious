import argon2 from "argon2";
import { eq } from "drizzle-orm";
import type { RegisterInput, LoginInput, User } from "@notorious/shared";
import { db } from "../../db/client.js";
import { users, workspaceInvites, workspaceMembers } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { badRequest, unauthorized } from "../../lib/httpError.js";
import { createWorkspace } from "../workspaces/service.js";

const AVATAR_COLORS = ["#6366f1", "#22c55e", "#f97316", "#ec4899", "#0ea5e9", "#eab308"];

function toUser(row: typeof users.$inferSelect): User {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarColor: row.avatarColor,
    createdAt: row.createdAt,
  };
}

/**
 * Registers a new user, creates their first personal workspace, and redeems
 * any pending invites addressed to their email so shared workspaces show up
 * immediately after sign-up.
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

  return { id, email: input.email, name: input.name, avatarColor, createdAt };
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
