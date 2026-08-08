/**
 * Deletes a user account from the command line - there's no way to do this
 * from the app itself (an account can leave a workspace, but nothing lets a
 * member remove another user's account entirely).
 *
 * Usage:
 *   node dist/scripts/deleteUser.js --email=jane@example.com [--yes]
 *   node dist/scripts/deleteUser.js              (prompts for email, always confirms)
 *
 * Every workspace the user *owns* is deleted in full - objects, blocks,
 * files, every other member's access to it, all of it - since an admin
 * running this from the shell is the one place in the app a workspace can be
 * torn down out from under its other members. Content the user merely
 * *created* in a workspace they don't own (an object, an uploaded file, a
 * view, ...) is left in place for that workspace's remaining members, with
 * its "created by" attribution reassigned to a shared "Deleted User"
 * placeholder account instead of being deleted along with them - see
 * `ensurePlaceholderUser` below. Everything else (sessions, API keys,
 * membership rows, notifications, saved searches, ...) already cascades away
 * with the user row itself (see db/schema.ts's `onDelete: "cascade"` on
 * each), so isn't handled here explicitly.
 */
import * as readline from "node:readline";
import argon2 from "argon2";
import { eq, and, notInArray } from "drizzle-orm";
import type { SQLiteColumn } from "drizzle-orm/sqlite-core";
import { db, sqlite } from "../db/client.js";
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
} from "../db/schema.js";
import { newId, nowIso } from "../lib/ids.js";
import { deleteWorkspace } from "../modules/workspaces/service.js";

const PLACEHOLDER_USER_ID = "system-deleted-user";
const PLACEHOLDER_USER_EMAIL = "deleted-user@system.notorious.local";

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (const raw of argv) {
    const match = /^--([^=]+)(?:=(.*))?$/.exec(raw);
    if (match) args[match[1]!] = match[2] ?? "true";
  }
  return args;
}

function ask(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

/**
 * A real `users` row (id fixed, so re-running this script reuses the same
 * one instead of piling up a new placeholder per deletion) that reassigned
 * "created by"/"actor" columns point to - lets that content keep rendering
 * a sensible name ("Deleted User") instead of either a dangling id or
 * requiring every such column to be made nullable across the schema.
 */
async function ensurePlaceholderUser(): Promise<string> {
  const existing = await db.select({ id: users.id }).from(users).where(eq(users.id, PLACEHOLDER_USER_ID)).limit(1);
  if (existing.length > 0) return PLACEHOLDER_USER_ID;

  const passwordHash = await argon2.hash(newId());
  await db.insert(users).values({
    id: PLACEHOLDER_USER_ID,
    email: PLACEHOLDER_USER_EMAIL,
    passwordHash,
    name: "Deleted User",
    createdAt: nowIso(),
  });
  return PLACEHOLDER_USER_ID;
}

/** Rows in `column`'s table attributed to `userId`, but outside every workspace in `ownedWorkspaceIds` - those inside are about to be deleted wholesale along with the owning workspace, so reassigning them first would be pointless work undone a moment later. */
function foreignCondition(workspaceIdColumn: SQLiteColumn, userColumn: SQLiteColumn, userId: string, ownedWorkspaceIds: string[]) {
  return ownedWorkspaceIds.length > 0
    ? and(eq(userColumn, userId), notInArray(workspaceIdColumn, ownedWorkspaceIds))
    : eq(userColumn, userId);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const email = (args.email ?? (await ask(rl, "Email of the user to delete: "))).trim();

    const userRows = await db.select().from(users).where(eq(users.email, email)).limit(1);
    const user = userRows[0];
    if (!user) throw new Error(`No user found with email "${email}"`);
    if (user.id === PLACEHOLDER_USER_ID) throw new Error("Refusing to delete the internal 'Deleted User' placeholder account.");

    const ownedWorkspaces = await db.select().from(workspaces).where(eq(workspaces.ownerId, user.id));
    const ownedIds = ownedWorkspaces.map((w) => w.id);

    const ownedSummaries = await Promise.all(
      ownedWorkspaces.map(async (workspace) => {
        const [members, workspaceObjects] = await Promise.all([
          db.select({ id: workspaceMembers.userId }).from(workspaceMembers).where(eq(workspaceMembers.workspaceId, workspace.id)),
          db.select({ id: objects.id }).from(objects).where(eq(objects.workspaceId, workspace.id)),
        ]);
        return { name: workspace.name, memberCount: members.length, objectCount: workspaceObjects.length };
      }),
    );

    const foreignCounts = {
      objects: (await db.select({ id: objects.id }).from(objects).where(foreignCondition(objects.workspaceId, objects.createdBy, user.id, ownedIds))).length,
      files: (await db.select({ id: files.id }).from(files).where(foreignCondition(files.workspaceId, files.uploadedBy, user.id, ownedIds))).length,
      views: (await db.select({ id: views.id }).from(views).where(foreignCondition(views.workspaceId, views.createdBy, user.id, ownedIds))).length,
      activityLog: (await db.select({ id: activityLog.id }).from(activityLog).where(foreignCondition(activityLog.workspaceId, activityLog.actorId, user.id, ownedIds))).length,
      blockHistory: (await db.select({ id: blockHistory.id }).from(blockHistory).where(foreignCondition(blockHistory.workspaceId, blockHistory.actorId, user.id, ownedIds))).length,
      shareLinks: (await db.select({ id: shareLinks.id }).from(shareLinks).where(foreignCondition(shareLinks.workspaceId, shareLinks.createdBy, user.id, ownedIds))).length,
      webhooks: (await db.select({ id: webhooks.id }).from(webhooks).where(foreignCondition(webhooks.workspaceId, webhooks.createdBy, user.id, ownedIds))).length,
      workspaceInvites: (await db.select({ id: workspaceInvites.id }).from(workspaceInvites).where(foreignCondition(workspaceInvites.workspaceId, workspaceInvites.invitedBy, user.id, ownedIds))).length,
    };
    const foreignTotal = Object.values(foreignCounts).reduce((a, b) => a + b, 0);

    console.warn(`\nAbout to delete user ${user.email} (${user.name}):`);
    if (ownedSummaries.length === 0) {
      console.warn("  Owns no workspaces.");
    } else {
      console.warn(`  Owns ${ownedSummaries.length} workspace(s), which will be deleted ENTIRELY (including for any other members):`);
      for (const summary of ownedSummaries) {
        console.warn(`    - "${summary.name}": ${summary.memberCount} member(s), ${summary.objectCount} object(s)`);
      }
    }
    if (foreignTotal === 0) {
      console.warn("  Created no content in other workspaces.");
    } else {
      console.warn(`  Created ${foreignTotal} item(s) in other (non-owned) workspaces - these are KEPT, reattributed to "Deleted User":`);
      for (const [key, count] of Object.entries(foreignCounts)) {
        if (count > 0) console.warn(`    - ${count} ${key}`);
      }
    }

    const confirmed = args.yes === "true" || (await ask(rl, "\nProceed with deletion? (yes/no): ")).trim().toLowerCase() === "yes";
    if (!confirmed) {
      console.warn("Aborted - nothing was deleted.");
      return;
    }

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

    console.warn(`\nDeleted user ${user.email}.`);
  } catch (error) {
    console.error("Could not delete user:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    rl.close();
    sqlite.close();
  }
}

void main();
