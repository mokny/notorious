import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs/promises";
import matter from "gray-matter";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { objectTypes, workspaces } from "../../db/schema.js";
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

/**
 * Every workspace must always have a dashboard object (see workspaces/routes.ts's PATCH
 * handler, which refuses to ever null the pointer out again). This is the guaranteed-to-succeed
 * fallback for whenever `seedDashboardNote` can't run (missing/malformed seed file) - a bare
 * empty "Dashboard" note, with none of the seed file's content/icon.
 */
export async function createFallbackDashboardNote(workspaceId: string, userId: string): Promise<string> {
  const noteType = await db
    .select({ id: objectTypes.id })
    .from(objectTypes)
    .where(and(eq(objectTypes.workspaceId, workspaceId), eq(objectTypes.key, "note")))
    .limit(1);
  const noteTypeId = noteType[0]?.id;
  if (!noteTypeId) throw new Error(`Note object type not found for workspace ${workspaceId}`);

  const object = await createObject(workspaceId, userId, {
    objectTypeId: noteTypeId,
    title: "Dashboard",
    icon: null,
    values: {},
  });
  return object.id;
}

/**
 * Boot-time backfill for workspaces created before this invariant existed, whose
 * `dashboardObjectId` is still null (either the seed file was missing/malformed at the time, or
 * they predate the dashboard feature entirely). Called once from server.ts on every startup -
 * a no-op once every workspace has been backfilled.
 */
export async function ensureAllWorkspaceDashboards(): Promise<void> {
  const rows = await db
    .select({ id: workspaces.id, ownerId: workspaces.ownerId })
    .from(workspaces)
    .where(isNull(workspaces.dashboardObjectId));

  for (const row of rows) {
    const dashboardObjectId = await createFallbackDashboardNote(row.id, row.ownerId);
    await db.update(workspaces).set({ dashboardObjectId }).where(eq(workspaces.id, row.id));
    console.warn(`[workspaces] Backfilled missing dashboard for workspace ${row.id}`);
  }
}
