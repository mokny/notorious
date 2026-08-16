import fs from "node:fs";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";
import argon2 from "argon2";
import { eq, and, notInArray, desc, isNull, sql } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import type { ChannelVersionCheck, UpdateChannel, UpdateRun, VersionCheckResult, PushNotificationPayload, AdminNotification } from "@notorious/shared";
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
  updateRuns,
  adminNotifications,
} from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { badRequest, conflict, notFound } from "../../lib/httpError.js";
import { registerUser } from "../auth/service.js";
import { deleteWorkspace } from "../workspaces/service.js";
import { notifyUser } from "../push/service.js";
import { sendToUserGlobal } from "../realtime/hub.js";
import { countServerAdmins } from "./access.js";
import { repoRoot } from "../../env.js";

const PLACEHOLDER_USER_ID = "system-deleted-user";
const PLACEHOLDER_USER_EMAIL = "deleted-user@system.notorious.local";

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
  totpEnabled: boolean;
}

export async function listUsers(): Promise<AdminUserSummary[]> {
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      createdAt: users.createdAt,
      isServerAdmin: users.isServerAdmin,
      totpEnabled: users.totpEnabled,
    })
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
  return { user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt, isServerAdmin: user.isServerAdmin, totpEnabled: false }, password };
}

/** Admin-driven email/name edit - no current-password check (the admin isn't the account owner). Returns both the pre- and post-edit summary so the caller (routes.ts) can build a precise audit-log message. */
export async function updateUserProfileByAdmin(userId: string, input: { email: string; name: string }): Promise<{ before: AdminUserSummary; after: AdminUserSummary }> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const target = rows[0];
  if (!target) throw notFound("User not found");

  if (input.email !== target.email) {
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, input.email)).limit(1);
    if (existing[0] && existing[0].id !== userId) throw badRequest("An account with this email already exists");
  }

  await db.update(users).set({ email: input.email, name: input.name }).where(eq(users.id, userId));
  const before: AdminUserSummary = { id: target.id, email: target.email, name: target.name, createdAt: target.createdAt, isServerAdmin: target.isServerAdmin, totpEnabled: target.totpEnabled };
  return { before, after: { ...before, email: input.email, name: input.name } };
}

/** Admin-driven password reset - no current-password check. `password` omitted generates a random one (same as `createUserByAdmin`), returned once for the admin to relay to the user. */
export async function resetPasswordByAdmin(userId: string, password?: string): Promise<{ user: AdminUserSummary; password: string }> {
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  const target = rows[0];
  if (!target) throw notFound("User not found");

  const finalPassword = password ?? generatePassword();
  const passwordHash = await argon2.hash(finalPassword);
  await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
  return { user: { id: target.id, email: target.email, name: target.name, createdAt: target.createdAt, isServerAdmin: target.isServerAdmin, totpEnabled: target.totpEnabled }, password: finalPassword };
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
  return { id: target.id, email: target.email, name: target.name, createdAt: target.createdAt, isServerAdmin: isAdmin, totpEnabled: target.totpEnabled };
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

const GITHUB_LATEST_RELEASE_URL = "https://api.github.com/repos/mokny/notorious/releases/latest";
const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/mokny/notorious";

/** Fetches `package.json`'s `version` field from a given ref (branch name or tag) on GitHub, or `null` on any failure/timeout. */
async function fetchRemoteVersion(ref: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(`${GITHUB_RAW_BASE}/${ref}/package.json`, { signal: controller.signal });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const remote = (await response.json()) as { version?: string };
    return remote.version ?? null;
  } catch {
    return null;
  }
}

/** The `tag_name` of the latest published GitHub Release (see `scripts/release.mjs`), or `null` if none exists yet/the API call fails. */
async function fetchLatestReleaseTag(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(GITHUB_LATEST_RELEASE_URL, {
      signal: controller.signal,
      headers: { Accept: "application/vnd.github+json" },
    });
    clearTimeout(timeout);
    if (!response.ok) return null;
    const data = (await response.json()) as { tag_name?: string };
    return data.tag_name ?? null;
  } catch {
    return null;
  }
}

/** The ref a channel currently resolves to - `release` falls back to `main` (same as nightly) when no GitHub Release has been published yet, mirroring scripts/update.sh's fallback. */
async function resolveChannelRef(channel: UpdateChannel): Promise<{ ref: string; hasRelease: boolean }> {
  if (channel === "nightly") return { ref: "main", hasRelease: true };
  const tag = await fetchLatestReleaseTag();
  return tag ? { ref: tag, hasRelease: true } : { ref: "main", hasRelease: false };
}

/**
 * Compares the running `package.json` version against a single channel's
 * latest on GitHub. There are no version numbers in tags for nightly - the
 * pre-commit hook (`.githooks/pre-commit` -> `scripts/bump-version.mjs`)
 * bumps the patch version on every commit, so `main`'s version string is
 * effectively a monotonic build counter, good enough to detect "main has
 * moved on". `release` compares against the latest GitHub Release cut by
 * `npm run release` (see scripts/release.mjs).
 */
export async function checkChannelForUpdate(channel: UpdateChannel, currentVersion: string): Promise<ChannelVersionCheck> {
  const { ref, hasRelease } = await resolveChannelRef(channel);
  const latest = hasRelease || channel === "nightly" ? await fetchRemoteVersion(ref) : null;
  return {
    current: currentVersion,
    latest,
    updateAvailable: latest !== null && isNewerVersion(currentVersion, latest),
    wouldDowngrade: latest !== null && isNewerVersion(latest, currentVersion),
    hasRelease,
  };
}

export async function checkForUpdate(currentVersion: string): Promise<VersionCheckResult> {
  const [nightly, release] = await Promise.all([
    checkChannelForUpdate("nightly", currentVersion),
    checkChannelForUpdate("release", currentVersion),
  ]);
  return { nightly, release };
}

// ---- Update / restart -----------------------------------------------------

const SYSTEMD_UNIT_PATH = "/etc/systemd/system/notorious.service";

/** Whether `sudo -n` (non-interactive) already succeeds for this user - i.e. a `NOPASSWD` sudoers rule is already set up, so no password prompt is needed at all. */
function canSudoWithoutPassword(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("sudo", ["-n", "true"], { env: updateScriptEnv() });
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

/**
 * Whether the UI needs to collect a sudo password before an update can
 * actually restart the service. False when: already running as root (no
 * `sudo` needed at all); no systemd unit is installed (update.sh won't
 * attempt a restart either way); or a `NOPASSWD` sudoers rule already covers
 * this user. Only true for the "non-root, no passwordless sudo configured"
 * case scripts/update.sh's own embedded `sudo` call would otherwise fail on
 * silently (no TTY to prompt on) when triggered from this UI.
 */
export async function updateNeedsSudoPassword(): Promise<boolean> {
  if (process.getuid && process.getuid() === 0) return false;
  if (!fs.existsSync(SYSTEMD_UNIT_PATH)) return false;
  return !(await canSudoWithoutPassword());
}

/**
 * Validates a sudo password by actually attempting to authenticate with it -
 * `-k` first discards any cached timestamp so a stale/unrelated cache can't
 * produce a false positive, `-v` just authenticates/refreshes the timestamp
 * without running a real command. Used to check the password *before*
 * kicking off the (multi-minute, already-in-progress-is-hard-to-undo)
 * update itself - see modules/admin/routes.ts's `POST /api/v1/admin/update`.
 */
export function verifySudoPassword(password: string): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn("sudo", ["-S", "-k", "-v"], { env: updateScriptEnv(), stdio: ["pipe", "ignore", "ignore"] });
    child.stdin.write(`${password}\n`);
    child.stdin.end();
    child.on("close", (code) => resolve(code === 0));
    child.on("error", () => resolve(false));
  });
}

/**
 * Runs the exact same `scripts/update.sh` an operator would run over SSH -
 * downloads the latest `main` tarball, rebuilds, migrates, and restarts the
 * systemd service if one is set up. Returns the child process so the caller
 * (modules/admin/routes.ts) can stream its stdout/stderr to the admin UI
 * live; the process (and the Node server itself, once systemd restarts it)
 * outlives the HTTP request that triggered it.
 *
 * `skipRestart` is set when the caller already validated a sudo password via
 * `verifySudoPassword` and will restart the service itself afterward (see
 * `restartWithSudoPassword`) - update.sh's own embedded `sudo systemctl
 * restart` has no way to prompt for a password here (no TTY), so doing the
 * restart as a separate, explicitly-password-fed step is the only way to
 * make it actually succeed non-interactively as a non-root user.
 *
 * `channel` is forwarded as `--channel=<nightly|release>` - update.sh
 * requires it (see scripts/update.sh's usage check).
 *
 * `trigger`/`startedAt` are forwarded as env vars
 * (`NOTORIOUS_UPDATE_TRIGGER`/`NOTORIOUS_UPDATE_STARTED_AT`) that update.sh
 * passes straight through to the `record-update-outcome` script it runs
 * right before restarting the service - see that script's doc comment for
 * why the history/notification write has to happen there, before the
 * restart, rather than after this child process's `close` event (which a
 * successful update's own restart never lives to fire).
 */
export function runUpdateScript(skipRestart: boolean, channel: UpdateChannel, trigger: "manual" | "auto", startedAt: string) {
  const env = updateScriptEnv();
  if (skipRestart) env.NOTORIOUS_SKIP_RESTART = "1";
  env.NOTORIOUS_UPDATE_TRIGGER = trigger;
  env.NOTORIOUS_UPDATE_STARTED_AT = startedAt;
  return spawn("bash", ["scripts/update.sh", `--channel=${channel}`], { cwd: repoRoot, detached: true, env });
}

/**
 * Restarts the systemd service using a sudo password already validated by
 * `verifySudoPassword`, piped only to this one `sudo` process's stdin -
 * deliberately never set as an env var (unlike `NOTORIOUS_SKIP_RESTART`
 * above), since an env var would be inherited by the whole `npm
 * install`/`npm run build` process tree that update.sh just ran, including
 * every dependency's install/build script - a much larger, far less trusted
 * surface than this one dedicated `sudo systemctl restart` call. Detached
 * and unref'd because the restart itself kills the very process making this
 * call (see the "outlives" note on `runUpdateScript`).
 */
export function restartWithSudoPassword(password: string): void {
  const child = spawn("sudo", ["-S", "systemctl", "restart", "notorious"], {
    env: updateScriptEnv(),
    detached: true,
    stdio: ["pipe", "ignore", "ignore"],
  });
  child.stdin.write(`${password}\n`);
  child.stdin.end();
  child.unref();
}

/**
 * `spawn` inherits the calling process's env by default - which, for the
 * running server, includes `NODE_ENV=production` (set via `.env`, see
 * env.ts). `npm install` treats a `NODE_ENV=production` in its own
 * environment as "skip devDependencies", which breaks the `npm run build`
 * step that follows (needs `typescript` and the `@types/*` packages) - a
 * failure mode that only shows up when the update is triggered from inside
 * the app itself, not when run manually from a plain SSH shell (which never
 * had `NODE_ENV` set to begin with). Stripping it here makes the two paths
 * behave the same.
 */
function updateScriptEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.NODE_ENV;
  return env;
}

/**
 * Restarts the systemd service directly (no rebuild/migration) - used after
 * writing new calls `.env` values, which only take effect on process
 * restart. No-op (just reports it) if no systemd unit is installed, same
 * fallback as scripts/update.sh - including the same `sudo` prefix when not
 * already running as root (see scripts/install.sh, which sets up the
 * service with `User=$APP_USER`, not necessarily root). Note this
 * (correctly) fails outright rather than hanging if `sudo` would need an
 * interactive password: this process has no TTY, and a passwordless
 * `NOPASSWD` sudoers rule for this exact command is required for an
 * unattended restart to actually work on a non-root install.
 */
export function restartServerProcess() {
  return spawn(
    "bash",
    [
      "-c",
      `SUDO=""; if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then SUDO="sudo"; fi; ` +
        `if command -v systemctl >/dev/null 2>&1 && [ -f /etc/systemd/system/notorious.service ]; then $SUDO systemctl restart notorious; ` +
        `else echo 'No systemd service found - restart the app manually.'; fi`,
    ],
    { cwd: repoRoot, detached: true },
  );
}

// ---- Update history / notifications ---------------------------------------

/** Sends a Web Push notification to every account with `users.is_server_admin` set - used by modules/admin/autoUpdateScheduler.ts (and scripts/recordUpdateOutcome.ts) to report an unattended update's outcome (nobody is watching the admin panel when it runs). Also writes an `admin_notifications` row and pushes it live over `/ws/chat` for each admin - see `toAdminNotification`'s doc comment for why this and Web Push are sent together rather than one implying the other. */
export async function notifyAllAdmins(payload: PushNotificationPayload): Promise<void> {
  const admins = await db.select({ id: users.id }).from(users).where(eq(users.isServerAdmin, true));
  await Promise.all(
    admins.map(async (admin) => {
      await notifyUser(admin.id, payload);
      if ("url" in payload) await createAdminNotification(admin.id, { type: payload.type, title: payload.title, body: payload.body, url: payload.url });
    }),
  );
}

function toAdminNotification(row: typeof adminNotifications.$inferSelect): AdminNotification {
  return { id: row.id, userId: row.userId, type: row.type, title: row.title, body: row.body, url: row.url, createdAt: row.createdAt, readAt: row.readAt };
}

/**
 * Writes one admin-bell row and pushes it live to the recipient's connected
 * devices - the in-app counterpart to `notifyUser`'s Web Push, sent from the
 * same call sites (currently only `notifyAllAdmins` above) so a bell entry
 * and a push notification always go out together for the same event.
 */
async function createAdminNotification(userId: string, input: { type: string; title: string; body: string; url: string }): Promise<void> {
  const notification = toAdminNotification({ id: newId(), userId, createdAt: nowIso(), readAt: null, ...input });
  await db.insert(adminNotifications).values(notification);
  sendToUserGlobal(userId, { type: "adminNotification", notification });
}

/** Most-recent-first, capped at 50 - a bell dropdown, not a full archive. Mirrors modules/notifications/service.ts's `listNotifications`. */
export async function listAdminNotifications(userId: string): Promise<AdminNotification[]> {
  const rows = await db.select().from(adminNotifications).where(eq(adminNotifications.userId, userId)).orderBy(desc(adminNotifications.createdAt)).limit(50);
  return rows.map(toAdminNotification);
}

export async function countUnreadAdminNotifications(userId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(adminNotifications)
    .where(and(eq(adminNotifications.userId, userId), isNull(adminNotifications.readAt)));
  return Number(rows[0]?.count ?? 0);
}

export async function markAdminNotificationRead(id: string, userId: string): Promise<void> {
  await db.update(adminNotifications).set({ readAt: nowIso() }).where(and(eq(adminNotifications.id, id), eq(adminNotifications.userId, userId)));
}

export async function markAllAdminNotificationsRead(userId: string): Promise<void> {
  await db.update(adminNotifications).set({ readAt: nowIso() }).where(and(eq(adminNotifications.userId, userId), isNull(adminNotifications.readAt)));
}

export interface RecordUpdateRunInput {
  startedAt: string;
  finishedAt: string;
  trigger: "manual" | "auto";
  channel: UpdateChannel;
  fromVersion: string;
  toVersion: string | null;
  status: "success" | "failure";
  errorMessage: string | null;
}

/** Writes one `update_runs` row - see modules/admin/autoUpdateScheduler.ts, which always writes one (success or failure) for every genuinely attempted update. */
export async function recordUpdateRun(input: RecordUpdateRunInput): Promise<void> {
  await db.insert(updateRuns).values({ id: newId(), ...input });
}

export async function listUpdateHistory(limit = 10): Promise<UpdateRun[]> {
  const rows = await db.select().from(updateRuns).orderBy(desc(updateRuns.startedAt)).limit(limit);
  return rows as UpdateRun[];
}

