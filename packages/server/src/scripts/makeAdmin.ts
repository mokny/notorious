/**
 * Grants the instance-wide server-admin role to one or more users - the
 * shell-only bootstrap for the very first admin (the app also does this
 * automatically for the first-ever registered account, see
 * modules/auth/service.ts's `registerUser`) and a recovery path if the UI
 * (/admin) is ever unreachable. Every other admin is granted through the UI
 * once at least one exists.
 *
 * Usage:
 *   node dist/scripts/makeAdmin.js --email=jane@example.com --email=bob@example.com
 *   node dist/scripts/makeAdmin.js --email=jane@example.com,bob@example.com
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
    console.error("Usage: make-admin -- --email=jane@example.com [--email=bob@example.com]");
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
    await db.update(users).set({ isServerAdmin: true }).where(eq(users.id, row.id));
    console.warn(`Granted server-admin to ${row.email}.`);
  }
}

void main()
  .catch((error) => {
    console.error("Could not grant admin:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
