/**
 * Revokes the instance-wide server-admin role from one or more users -
 * symmetric counterpart to make-admin.ts, for shell-level recovery when the
 * /admin UI is unreachable. Unlike the UI's own demote action, this does
 * NOT block removing the last remaining admin - shell access already implies
 * full control over the instance (including re-granting it with make-admin),
 * so the softer UI-only safety net would just get in the way here. A warning
 * is still printed if this leaves zero admins.
 *
 * Usage:
 *   node dist/scripts/revokeAdmin.js --email=jane@example.com --email=bob@example.com
 *   node dist/scripts/revokeAdmin.js --email=jane@example.com,bob@example.com
 */
import { eq, inArray } from "drizzle-orm";
import { db, sqlite } from "../db/client.js";
import { users } from "../db/schema.js";

function parseEmails(argv: string[]): string[] {
  const emails: string[] = [];
  for (const raw of argv) {
    const match = /^--email=(.*)$/.exec(raw);
    if (match) emails.push(...match[1]!.split(",").map((email) => email.trim()).filter(Boolean));
  }
  return emails;
}

async function main(): Promise<void> {
  const emails = parseEmails(process.argv.slice(2));
  if (emails.length === 0) {
    console.error("Usage: revoke-admin -- --email=jane@example.com [--email=bob@example.com]");
    process.exitCode = 1;
    return;
  }

  const rows = await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.email, emails));
  const found = new Set(rows.map((row) => row.email));
  const missing = emails.filter((email) => !found.has(email));
  if (missing.length > 0) {
    console.error(`No account found for: ${missing.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  for (const row of rows) {
    await db.update(users).set({ isServerAdmin: false }).where(eq(users.id, row.id));
    console.warn(`Revoked server-admin from ${row.email}.`);
  }

  const remaining = await db.select({ id: users.id }).from(users).where(eq(users.isServerAdmin, true));
  if (remaining.length === 0) {
    console.warn("\nWarning: no server admin remains. Run make-admin to grant it to someone.");
  }
}

void main()
  .catch((error) => {
    console.error("Could not revoke admin:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
