/**
 * One-off data migration for the TipTap-based table rewrite: converts every
 * `table` block still storing the pre-rewrite `{ columns: string[], rows:
 * string[][] }` shape into the new `{ doc: TableDoc }` shape (see
 * blockContent.ts and utils/tableDoc.ts). Idempotent - a block that already
 * has a `doc` field is left untouched, so this is safe to re-run.
 *
 * Usage:
 *   npm run migrate-table-blocks
 */
import { eq } from "drizzle-orm";
import { gridToTableDoc } from "@notorious/shared";
import { db, sqlite } from "../db/client.js";
import { blocks } from "../db/schema.js";

async function main(): Promise<void> {
  const rows = await db.select({ id: blocks.id, content: blocks.content }).from(blocks).where(eq(blocks.type, "table"));

  let migrated = 0;
  for (const row of rows) {
    const content = JSON.parse(row.content) as { doc?: unknown; columns?: string[]; rows?: string[][] };
    if (content.doc) continue;

    const doc = gridToTableDoc(content.columns ?? [], content.rows ?? []);
    await db.update(blocks).set({ content: JSON.stringify({ doc }) }).where(eq(blocks.id, row.id));
    migrated += 1;
  }

  console.warn(`Migrated ${migrated} of ${rows.length} table block(s).`);
}

void main()
  .catch((error) => {
    console.error("Could not migrate table blocks:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => sqlite.close());
