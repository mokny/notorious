/**
 * Deletes a user account from the command line - there's no way to do this
 * from the app itself (an account can leave a workspace, but nothing lets a
 * member remove another user's account entirely). Also available from the
 * /admin UI for a server admin (see modules/admin/), which shares this exact
 * deletion logic (modules/admin/service.ts's `previewUserDeletion`/
 * `deleteUserAccount`).
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
 * placeholder account instead of being deleted along with them.
 */
import * as readline from "node:readline";
import { eq } from "drizzle-orm";
import { db, sqlite } from "../db/client.js";
import { users } from "../db/schema.js";
import { previewUserDeletion, deleteUserAccount } from "../modules/admin/service.js";

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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  try {
    const email = (args.email ?? (await ask(rl, "Email of the user to delete: "))).trim();

    const userRows = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    const user = userRows[0];
    if (!user) throw new Error(`No user found with email "${email}"`);

    const preview = await previewUserDeletion(user.id);

    console.warn(`\nAbout to delete user ${preview.user.email} (${preview.user.name}):`);
    if (preview.ownedWorkspaces.length === 0) {
      console.warn("  Owns no workspaces.");
    } else {
      console.warn(`  Owns ${preview.ownedWorkspaces.length} workspace(s), which will be deleted ENTIRELY (including for any other members):`);
      for (const workspace of preview.ownedWorkspaces) {
        console.warn(`    - "${workspace.name}": ${workspace.memberCount} member(s), ${workspace.objectCount} object(s)`);
      }
    }
    if (preview.reattributedItemCount === 0) {
      console.warn("  Created no content in other workspaces.");
    } else {
      console.warn(`  Created ${preview.reattributedItemCount} item(s) in other (non-owned) workspaces - these are KEPT, reattributed to "Deleted User".`);
    }

    const confirmed = args.yes === "true" || (await ask(rl, "\nProceed with deletion? (yes/no): ")).trim().toLowerCase() === "yes";
    if (!confirmed) {
      console.warn("Aborted - nothing was deleted.");
      return;
    }

    await deleteUserAccount(user.id);
    console.warn(`\nDeleted user ${preview.user.email}.`);
  } catch (error) {
    console.error("Could not delete user:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    rl.close();
    sqlite.close();
  }
}

void main();
