import { sqlite } from "../../db/client.js";
import { db } from "../../db/client.js";
import { blocks } from "../../db/schema.js";
import { eq } from "drizzle-orm";

/** Extracts plain text from a block's JSON content for indexing, regardless of block type. */
function extractText(content: Record<string, unknown>): string {
  const parts: string[] = [];

  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      parts.push(value);
    } else if (Array.isArray(value)) {
      for (const item of value) visit(item);
    } else if (value && typeof value === "object") {
      for (const v of Object.values(value)) visit(v);
    }
  };

  visit(content);
  return parts.join(" ");
}

/** Re-flattens every block belonging to an object into a single text blob for FTS. */
export async function flattenObjectBody(objectId: string): Promise<string> {
  const rows = await db.select({ content: blocks.content }).from(blocks).where(eq(blocks.objectId, objectId));
  return rows
    .map((row) => extractText(JSON.parse(row.content) as Record<string, unknown>))
    .join(" ")
    .slice(0, 200_000);
}

/** Upserts (title, body) into the FTS index for one object. */
export function indexObject(objectId: string, title: string, body: string): void {
  sqlite.prepare("DELETE FROM objects_fts WHERE object_id = ?").run(objectId);
  sqlite
    .prepare("INSERT INTO objects_fts (object_id, title, body) VALUES (?, ?, ?)")
    .run(objectId, title, body);
}

export function removeFromIndex(objectId: string): void {
  sqlite.prepare("DELETE FROM objects_fts WHERE object_id = ?").run(objectId);
}

/** Recomputes and re-indexes an object's body from its current blocks. Call after any block edit. */
export async function reindexObjectBody(objectId: string, title: string): Promise<void> {
  const body = await flattenObjectBody(objectId);
  indexObject(objectId, title, body);
}
