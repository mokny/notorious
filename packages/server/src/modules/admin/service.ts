import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import argon2 from "argon2";
import { eq, and, notInArray, desc } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { db } from "../../db/client.js";
import {
  users,
  workspaces,
  workspaceMembers,
  objects,
  files,
  views,
  activityLog,
  blockHistory,
  shareLinks,
  webhooks,
  workspaceInvites,
  adminAuditLog,
} from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { badRequest, conflict, notFound } from "../../lib/httpError.js";
import { registerUser } from "../auth/service.js";
import { deleteWorkspace } from "../workspaces/service.js";
import { countServerAdmins } from "./access.js";
import { repoRoot } from "../../env.js";

const PLACEHOLDER_USER_ID = "system-deleted-user";
const PLACEHOLDER_USER_EMAIL = "deleted-user@system.notorious.local";
const GITHUB_PACKAGE_JSON_URL = "https://raw.githubusercontent.com/mokny/notorious/main/package.json";

// ---- Audit log --------------------------------------------------------

export async function logAdminAction(actor: { id: string; name: string }, action: string, summary: string): Promise<void> {
  await db.insert(adminAuditLog).values({
    id: newId(),
    actorId: actor.id,
    actorName: actor.name,
    action,
    summary,
    createdAt: nowIso(),
  });
}

export async function listAuditLog(limit = 200) {
  return db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt)).limit(limit);
}

// ---- User management ----------------------------------------------------

export interface AdminUserSummary {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  isServerAdmin: boolean;
}

export async function listUsers(): Promise<AdminUserSummary[]> {
  const rows = await db
    .select({ id: users.id, email: users.email, name: users.name, createdAt: users.createdAt, isServerAdmin: users.isServerAdmin })
    .from(users)
    .where(notInArray(users.id, [PLACEHOLDER_USER_ID]));
  return rows;
}

function generatePassword(): string {
  // 16 random bytes -> ~22 base64url chars, well above the 8-char minimum and easy to select/copy once.
  return randomBytes(16).toString("base64url");
}

/** Admin-created account - same as self-registration, but with a random initial password shown once instead of one the new user picks themselves (there's no email delivery to send it to them). */
export async function createUserByAdmin(input: { email: string; name: string }): Promise<{ user: AdminUserSummary; password: string }> {
  const password = generatePassword();
  const user = await registerUser({ email: input.email, name: input.name, password });
  return { user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt, isServerAdmin: user.isServerAdmin }, password };
}

/** Throws if this would leave the instance with zero server admins - see modules/admin/access.ts's `countServerAdmins`. */
export async function setServerAdmin(targetUserId: string, isAdmin: boolean): Promise<AdminUserSummary> {
  const rows = await db.select().from(users).where(eq(users.id, targetUserId)).limit(1);
  const target = rows[0];
  if (!target) throw notFound("User not found");

  if (!isAdmin && target.isServerAdmin) {
    const remaining = await countServerAdmins();
    if (remaining <= 1) throw conflict("Cannot remove the last remaining server admin");
  }

  await db.update(users).set({ isServerAdmin: isAdmin }).where(eq(users.id, targetUserId));
  return { id: target.id, email: target.email, name: target.name, createdAt: target.createdAt, isServerAdmin: isAdmin };
}

/** Rows in `column`'s table attributed to `userId`, but outside every workspace in `ownedWorkspaceIds` - mirrors scripts/deleteUser.ts's `foreignCondition`. */
function foreignCondition(workspaceIdColumn: SQLiteColumn, userColumn: SQLiteColumn, userId: string, ownedWorkspaceIds: string[]) {
  return ownedWorkspaceIds.length > 0
    ? and(eq(userColumn, userId), notInArray(workspaceIdColumn, ownedWorkspaceIds))
    : eq(userColumn, userId);
}

export interface UserDeletionPreview {
  user: { id: string; email: string; name: string };
  ownedWorkspaces: { id: string; name: string; memberCount: number; objectCount: number }[];
  reattributedItemCount: number;
}

/** Everything `deleteUserAccount` is about to do, for a confirmation UI to show before the caller commits - see scripts/deleteUser.ts, which this mirrors. */
export async function previewUserDeletion(userId: string): Promise<UserDeletionPreview> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) throw notFound("User not found");
  if (user.id === PLACEHOLDER_USER_ID) throw badRequest("Cannot delete the internal 'Deleted User' placeholder account");

  const ownedWorkspaces = await db.select().from(workspaces).where(eq(workspaces.ownerId, user.id));
  const ownedIds = ownedWorkspaces.map((w) => w.id);

  const ownedSummaries = await Promise.all(
    ownedWorkspaces.map(async (workspace) => {
      const [members, workspaceObjects] = await Promise.all([
        db.select({ id: workspaceMembers.userId }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspace.id)),
        db.select({ id: objects.id }).from(objects).where(eq(objects.workspaceId, workspace.id)),
      ]);
      return { id: workspace.id, name: workspace.name, memberCount: members.length, objectCount: workspaceObjects.length };
    }),
  );

  const foreignCounts = [
    (await db.select({ id: objects.id }).from(objects).where(foreignCondition(objects.workspaceId, objects.createdBy, user.id, ownedIds))).length,
    (await db.select({ id: files.id }).from(files).where(foreignCondition(files.workspaceId, files.uploadedBy, user.id, ownedIds))).length,
    (await db.select({ id: views.id }).from(views).where(foreignCondition(views.workspaceId, views.createdBy, user.id, ownedIds))).length,
    (await db.select({ id: activityLog.id }).from(activityLog).where(foreignCondition(activityLog.workspaceId, activityLog.actorId, user.id, ownedIds))).length,
    (await db.select({ id: blockHistory.id }).from(blockHistory).where(foreignCondition(blockHistory.workspaceId, blockHistory.actorId, user.id, ownedIds))).length,
    (await db.select({ id: shareLinks.id }).from(shareLinks).where(foreignCondition(shareLinks.workspaceId, shareLinks.createdBy, user.id, ownedIds))).length,
    (await db.select({ id: webhooks.id }).from(webhooks).where(foreignCondition(webhooks.workspaceId, webhooks.createdBy, user.id, ownedIds))).length,
    (await db.select({ id: workspaceInvites.id }).from(workspaceInvites).where(foreignCondition(workspaceInvites.workspaceId, workspaceInvites.invitedBy, user.id, ownedIds))).length,
  ];

  return {
    user: { id: user.id, email: user.email, name: user.name },
    ownedWorkspaces: ownedSummaries,
    reattributedItemCount: foreignCounts.reduce((a, b) => a + b, 0),
  };
}

async function ensurePlaceholderUser(): Promise<string> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, PLACEHOLDER_USER_ID)).limit(1);
  if (existing.length > 0) return PLACEHOLDER_USER_ID;

  const passwordHash = await argon2.hash(newId());
  await db.insert(users).values({ id: PLACEHOLDER_USER_ID, email: PLACEHOLDER_USER_EMAIL, passwordHash, name: "Deleted User", createdAt: nowIso() });
  return PLACEHOLDER_USER_ID;
}

/** Deletes a user account: every workspace they *own* is torn down entirely; content they merely created elsewhere is reattributed to a "Deleted User" placeholder. Mirrors scripts/deleteUser.ts exactly - see that file's doc comment for the full reasoning. */
export async function deleteUserAccount(userId: string): Promise<void> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const user = rows[0];
  if (!user) throw notFound("User not found");
  if (user.id === PLACEHOLDER_USER_ID) throw badRequest("Cannot delete the internal 'Deleted User' placeholder account");

  const ownedWorkspaces = await db.select({ id: workspaces.id }).from(workspaces).where(eq(workspaces.ownerId, user.id));
  const ownedIds = ownedWorkspaces.map((w) => w.id);
  const placeholderId = await ensurePlaceholderUser();

  await db.update(objects).set({ createdBy: placeholderId }).where(foreignCondition(objects.workspaceId, objects.createdBy, user.id, ownedIds));
  await db.update(files).set({ uploadedBy: placeholderId }).where(foreignCondition(files.workspaceId, files.uploadedBy, user.id, ownedIds));
  await db.update(views).set({ createdBy: placeholderId }).where(foreignCondition(views.workspaceId, views.createdBy, user.id, ownedIds));
  await db.update(activityLog).set({ actorId: placeholderId }).where(foreignCondition(activityLog.workspaceId, activityLog.actorId, user.id, ownedIds));
  await db.update(blockHistory).set({ actorId: placeholderId }).where(foreignCondition(blockHistory.workspaceId, blockHistory.actorId, user.id, ownedIds));
  await db.update(shareLinks).set({ createdBy: placeholderId }).where(foreignCondition(shareLinks.workspaceId, shareLinks.createdBy, user.id, ownedIds));
  await db.update(webhooks).set({ createdBy: placeholderId }).where(foreignCondition(webhooks.workspaceId, webhooks.createdBy, user.id, ownedIds));
  await db
    .update(workspaceInvites)
    .set({ invitedBy: placeholderId })
    .where(foreignCondition(workspaceInvites.workspaceId, workspaceInvites.invitedBy, user.id, ownedIds));

  for (const workspaceId of ownedIds) {
    await deleteWorkspace(workspaceId);
  }

  await db.delete(users).where(eq(users.id, user.id));
}

// ---- Version check --------------------------------------------------------

/** Compares two `major.minor.patch` strings - true if `latest` is strictly newer than `current`. */
function isNewerVersion(current: string, latest: string): boolean {
  const c = current.split(".").map(Number);
  const l = latest.split(".").map(Number);
  for (let i = 0; i < Math.max(c.length, l.length); i++) {
    const cv = c[i] ?? 0;
    const lv = l[i] ?? 0;
    if (lv > cv) return true;
    if (lv < cv) return false;
  }
  return false;
}

export interface VersionCheckResult {
  current: string;
  latest: string | null;
  updateAvailable: boolean;
}

/**
 * Compares the running `package.json` version against `main`'s on GitHub.
 * There are no git tags/releases in this repo - but the pre-commit hook
 * (`.githooks/pre-commit` -> `scripts/bump-version.mjs`) bumps the patch
 * version on every commit, so the version string itself is effectively a
 * monotonic build counter, good enough to detect "main has moved on".
 */
export async function checkForUpdate(currentVersion: string): Promise<VersionCheckResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(GITHUB_PACKAGE_JSON_URL, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return { current: currentVersion, latest: null, updateAvailable: false };
    const remote = (await response.json()) as { version?: string };
    if (!remote.version) return { current: currentVersion, latest: null, updateAvailable: false };
    return { current: currentVersion, latest: remote.version, updateAvailable: isNewerVersion(currentVersion, remote.version) };
  } catch {
    return { current: currentVersion, latest: null, updateAvailable: false };
  }
}

// ---- Update / restart -----------------------------------------------------

/**
 * Runs the exact same `scripts/update.sh` an operator would run over SSH -
 * downloads the latest `main` tarball, rebuilds, migrates, and restarts the
 * systemd service if one is set up. Returns the child process so the caller
 * (modules/admin/routes.ts) can stream its stdout/stderr to the admin UI
 * live; the process (and the Node server itself, once systemd restarts it)
 * outlives the HTTP request that triggered it.
 */
export function runUpdateScript() {
  return spawn("bash", ["scripts/update.sh"], { cwd: repoRoot, detached: true });
}

/** Restarts the systemd service directly (no rebuild/migration) - used after writing new calls `.env` values, which only take effect on process restart. No-op (just reports it) if no systemd unit is installed, same fallback as scripts/update.sh. */
export function restartServerProcess() {
  return spawn(
    "bash",
    ["-c", "if command -v systemctl >/dev/null 2>&1 && [ -f /etc/systemd/system/notorious.service ]; then systemctl restart notorious; else echo 'No systemd service found - restart the app manually.'; fi"],
    { cwd: repoRoot, detached: true },
  );
}

