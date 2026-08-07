import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import matter from "gray-matter";
import { eq, and } from "drizzle-orm";
import { db } from "../../db/client.js";
import { objectTypes } from "../../db/schema.js";
import { createObject } from "../objects/service.js";
import { replaceAllBlocks } from "../blocks/service.js";
import { markdownToBlockTree } from "../blocks/markdown.js";

// dist/modules/workspaces (prod) and src/modules/workspaces (dev) are both
// five path segments below the app/repo root, where docs/ lives - see the
// Dockerfile's runtime stage, which copies only this one file out of docs/.
const SEED_FILE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../docs/dashboard-seed.md",
);

/**
 * Creates a starter "Dashboard" note for a brand-new workspace from
 * docs/dashboard-seed.md, so freehand-editing that file is enough to change
 * what future workspaces start with. Never throws - a missing/malformed seed
 * file should not block workspace creation, it just means no dashboard note
 * gets set (dashboardObjectId stays null, same as before this feature).
 */
export async function seedDashboardNote(workspaceId: string, userId: string): Promise<string | null> {
  try {
    const raw = await fs.readFile(SEED_FILE_PATH, "utf-8");
    const { data, content } = matter(raw);

    const noteType = await db
      .select({ id: objectTypes.id })
      .from(objectTypes)
      .where(and(eq(objectTypes.workspaceId, workspaceId), eq(objectTypes.key, "note")))
      .limit(1);
    const noteTypeId = noteType[0]?.id;
    if (!noteTypeId) throw new Error("Note object type not found for new workspace");

    const object = await createObject(workspaceId, userId, {
      objectTypeId: noteTypeId,
      title: typeof data.title === "string" && data.title.trim() ? data.title : "Dashboard",
      icon: typeof data.icon === "string" && data.icon.trim() ? data.icon : null,
      values: {},
    });

    await replaceAllBlocks(object.id, markdownToBlockTree(content));

    return object.id;
  } catch (error) {
    console.warn("[workspaces] Skipping dashboard note seed:", error);
    return null;
  }
}
