import argon2 from "argon2";
import { eq, and, desc, isNull, isNotNull, lt } from "drizzle-orm";
import type { RegisterInput, LoginInput, ChangePasswordInput, ChangeEmailInput, UpdatePushPreferencesInput, UpdateLocaleInput, UpdateContentFontSizeInput, User } from "@notorious/shared";
import { db } from "../../db/client.js";
import { users, workspaceInvites, workspaceMembers, webauthnCredentials, failedLoginAttempts } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { badRequest, unauthorized } from "../../lib/httpError.js";
import { createWorkspace, nextMemberPosition } from "../workspaces/service.js";
import { getRegistrationEnabled } from "../instanceSettings/service.js";
import { hasAnyCredential } from "../webauthn/service.js";
import { sendToUserGlobal } from "../realtime/hub.js";

const AVATAR_COLORS = ["#6366f1", "#22c55e", "#f97316", "#ec4899", "#0ea5e9", "#eab308"];

async function toUser(row: typeof users.$inferSelect): Promise<User> {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    avatarColor: row.avatarColor,
    avatarUrl: row.avatarUrl,
    createdAt: row.createdAt,
    totpEnabled: row.totpEnabled,
    pushShowWhenOpen: row.pushShowWhenOpen,
    hasPassword: row.passwordHash !== null,
    hasPasskey: await hasAnyCredential(row.id),
    locale: row.locale,
    contentFontSizeMobile: row.contentFontSizeMobile,
    contentFontSizeDesktop: row.contentFontSizeDesktop,
    isServerAdmin: row.isServerAdmin,
    chatStatus: row.chatStatus,
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
  const isServerAdmin = await isFirstUser();

  await db.insert(users).values({ id, email: input.email, passwordHash, name: input.name, avatarColor, createdAt, isServerAdmin });
  await createWorkspace(id, { name: `${input.name}'s Workspace`, icon: "sparkles" });
  await redeemPendingInvites(id, input.email);

  return {
    id,
    email: input.email,
    name: input.name,
    avatarColor,
    avatarUrl: null,
    createdAt,
    totpEnabled: false,
    pushShowWhenOpen: true,
    hasPassword: true,
    hasPasskey: false,
    locale: null,
    contentFontSizeMobile: 100,
    contentFontSizeDesktop: 100,
    isServerAdmin,
    chatStatus: "green",
  };
}

/** Whether no account exists yet - the very next registration (via any path: UI, CLI create-user, or passkey signup) becomes the instance's first server admin automatically, see modules/admin/'s doc comment. */
async function isFirstUser(): Promise<boolean> {
  const rows = await db.select({ id: users.id }).from(users).limit(1);
  return rows.length === 0;
}

/**
 * The passkey-only counterpart to `registerUser` - same workspace-creation/invite-redemption
 * behavior, but the account has no password at all (`passwordHash` stays null) and its one
 * credential is the passkey verified by `modules/webauthn/service.ts`'s
 * `verifyRegistrationForNewAccount`, which is why `credential` arrives pre-verified here rather
 * than as a raw WebAuthn response. Also NOT gated on the self-registration setting for the same
 * reason as `registerUser` - the public endpoint (webauthn/routes.ts) checks `canRegisterEmail`
 * itself before ever starting the ceremony.
 */
export async function registerUserWithPasskey(
  email: string,
  name: string,
  credential: { credentialId: string; publicKey: string; counter: number; transports: string | null },
): Promise<User> {
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing[0]) throw badRequest("An account with this email already exists");

  const id = newId();
  const avatarColor = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)] ?? "#6366f1";
  const createdAt = nowIso();
  const isServerAdmin = await isFirstUser();

  await db.insert(users).values({ id, email, passwordHash: null, name, avatarColor, createdAt, isServerAdmin });
  await db.insert(webauthnCredentials).values({
    id: newId(),
    userId: id,
    credentialId: credential.credentialId,
    publicKey: credential.publicKey,
    counter: credential.counter,
    transports: credential.transports,
    name: "Passkey",
    createdAt,
    lastUsedAt: null,
  });
  await createWorkspace(id, { name: `${name}'s Workspace`, icon: "sparkles" });
  await redeemPendingInvites(id, email);

  return {
    id,
    email,
    name,
    avatarColor,
    avatarUrl: null,
    createdAt,
    totpEnabled: false,
    pushShowWhenOpen: true,
    hasPassword: false,
    hasPasskey: true,
    locale: null,
    contentFontSizeMobile: 100,
    contentFontSizeDesktop: 100,
    isServerAdmin,
    chatStatus: "green",
  };
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
      .values({ workspaceId: invite.workspaceId, userId, role: invite.role, joinedAt: nowIso(), position: await nextMemberPosition(userId) })
      .onConflictDoNothing();
    await db
      .update(workspaceInvites)
      .set({ status: "accepted" })
      .where(eq(workspaceInvites.id, invite.id));
  }
}

export type FailedLoginReason = "unknown_email" | "wrong_password" | "no_password_set";

/** Logged for the admin panel's "Failed Logins" tab (see `listFailedLogins`/`pruneFailedLoginAttempts` below) - no `userId` for an attempt against an email that doesn't belong to any account, since there's nothing to point at. */
async function recordFailedLogin(email: string, reason: FailedLoginReason, userId: string | null, ip: string | null, userAgent: string | null): Promise<void> {
  await db.insert(failedLoginAttempts).values({ id: newId(), email, userId, ip, userAgent, reason, createdAt: nowIso() });
}

export async function verifyCredentials(input: LoginInput, context: { ip: string | null; userAgent: string | null }): Promise<User> {
  const rows = await db.select().from(users).where(eq(users.email, input.email)).limit(1);
  const row = rows[0];
  if (!row) {
    await recordFailedLogin(input.email, "unknown_email", null, context.ip, context.userAgent);
    throw unauthorized("Invalid email or password");
  }
  if (row.passwordHash === null) {
    await recordFailedLogin(input.email, "no_password_set", row.id, context.ip, context.userAgent);
    throw unauthorized("This account doesn't have a password - sign in with a passkey instead");
  }

  const valid = await argon2.verify(row.passwordHash, input.password);
  if (!valid) {
    await recordFailedLogin(input.email, "wrong_password", row.id, context.ip, context.userAgent);
    throw unauthorized("Invalid email or password");
  }

  return toUser(row);
}

export interface FailedLoginEntry {
  id: string;
  email: string;
  userId: string | null;
  userName: string | null;
  ip: string | null;
  userAgent: string | null;
  reason: FailedLoginReason;
  createdAt: string;
}

/** Powers the admin panel's "Failed Logins" tab - `filter` splits attempts against a real account from ones against an email nobody registered (see modules/admin/routes.ts). Most-recent-first. */
export async function listFailedLogins(filter: "known" | "unknown", limit = 200): Promise<FailedLoginEntry[]> {
  const rows = await db
    .select({
      id: failedLoginAttempts.id,
      email: failedLoginAttempts.email,
      userId: failedLoginAttempts.userId,
      userName: users.name,
      ip: failedLoginAttempts.ip,
      userAgent: failedLoginAttempts.userAgent,
      reason: failedLoginAttempts.reason,
      createdAt: failedLoginAttempts.createdAt,
    })
    .from(failedLoginAttempts)
    .leftJoin(users, eq(failedLoginAttempts.userId, users.id))
    .where(filter === "known" ? isNotNull(failedLoginAttempts.userId) : isNull(failedLoginAttempts.userId))
    .orderBy(desc(failedLoginAttempts.createdAt))
    .limit(limit);
  return rows;
}

/** Deletes attempts older than `olderThanDays` - called daily by modules/admin/failedLoginCleanup.ts so this table doesn't grow unbounded on a publicly reachable instance getting scanned/brute-forced. */
export async function pruneFailedLoginAttempts(olderThanDays = 30): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000).toISOString();
  await db.delete(failedLoginAttempts).where(lt(failedLoginAttempts.createdAt, cutoff));
}

export async function getUserById(id: string): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ? toUser(rows[0]) : null;
}

/**
 * Requires the current password, same as `changeEmail` - this changes how the account is
 * authenticated, not a profile detail. Skips that check entirely for a passkey-only account
 * (`passwordHash === null`) - being logged in is already the gate there (same reasoning
 * `changeEmail` uses), and this doubles as "Set password" for such an account in Settings.
 */
export async function changePassword(userId: string, input: ChangePasswordInput): Promise<void> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const row = rows[0];
  if (!row) throw unauthorized();

  if (row.passwordHash !== null) {
    if (!input.currentPassword) throw badRequest("Current password is required");
    const valid = await argon2.verify(row.passwordHash, input.currentPassword);
    if (!valid) throw badRequest("Current password is incorrect");
  }

  const passwordHash = await argon2.hash(input.newPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
}

/** Skips the current-password check for a passkey-only account - see `changePassword`'s doc comment. */
export async function changeEmail(userId: string, input: ChangeEmailInput): Promise<User> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const row = rows[0];
  if (!row) throw unauthorized();

  if (row.passwordHash !== null) {
    if (!input.currentPassword) throw badRequest("Current password is required");
    const valid = await argon2.verify(row.passwordHash, input.currentPassword);
    if (!valid) throw badRequest("Current password is incorrect");
  }

  const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.newEmail)).limit(1);
  if (existing[0] && existing[0].id !== userId) throw badRequest("An account with this email already exists");

  await db.update(users).set({ email: input.newEmail }).where(eq(users.id, userId));
  return toUser({ ...row, email: input.newEmail });
}

export async function updatePushPreferences(userId: string, input: UpdatePushPreferencesInput): Promise<User> {
  await db.update(users).set({ pushShowWhenOpen: input.pushShowWhenOpen }).where(eq(users.id, userId));
  const user = await getUserById(userId);
  if (!user) throw unauthorized();
  return user;
}

/** Persists the user's preferred UI/push-notification language - see the `locale` schema field's doc comment and AuthContext.tsx's detection flow. */
export async function updateLocale(userId: string, input: UpdateLocaleInput): Promise<User> {
  await db.update(users).set({ locale: input.locale }).where(eq(users.id, userId));
  const user = await getUserById(userId);
  if (!user) throw unauthorized();
  return user;
}

/** Persists the user's content-area font-size preference (block editor + views) - see the schema fields' doc comment. Broadcasts `userSettingsUpdated` over the workspace-agnostic `/ws/chat` channel so every other open tab/device of this user picks it up live, the same way `sessionRevoked` does. */
export async function updateContentFontSize(userId: string, input: UpdateContentFontSizeInput): Promise<User> {
  await db
    .update(users)
    .set({ contentFontSizeMobile: input.contentFontSizeMobile, contentFontSizeDesktop: input.contentFontSizeDesktop })
    .where(eq(users.id, userId));
  const user = await getUserById(userId);
  if (!user) throw unauthorized();
  sendToUserGlobal(userId, { type: "userSettingsUpdated" });
  return user;
}
