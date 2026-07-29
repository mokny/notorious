import { eq, and, isNull } from "drizzle-orm";
import type { CreateViewInput, UpdateViewInput, View } from "@notorious/shared";
import { db } from "../../db/client.js";
import { views } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { notFound } from "../../lib/httpError.js";

function toView(row: typeof views.$inferSelect): View {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    objectTypeId: row.objectTypeId,
    name: row.name,
    type: row.type as View["type"],
    config: JSON.parse(row.config),
    createdBy: row.createdBy,
  };
}

export async function listViews(workspaceId: string, objectTypeId?: string): Promise<View[]> {
  const condition = objectTypeId
    ? and(eq(views.workspaceId, workspaceId), eq(views.objectTypeId, objectTypeId))
    : and(eq(views.workspaceId, workspaceId), isNull(views.objectTypeId));

  const rows = await db.select().from(views).where(condition);
  return rows.map(toView);
}

export async function getView(viewId: string): Promise<View> {
  const rows = await db.select().from(views).where(eq(views.id, viewId)).limit(1);
  const row = rows[0];
  if (!row) throw notFound("View not found");
  return toView(row);
}

export async function createView(
  workspaceId: string,
  userId: string,
  input: CreateViewInput,
): Promise<View> {
  const id = newId();
  await db.insert(views).values({
    id,
    workspaceId,
    objectTypeId: input.objectTypeId,
    name: input.name,
    type: input.type,
    config: JSON.stringify(input.config),
    createdBy: userId,
    createdAt: nowIso(),
  });
  return { id, workspaceId, objectTypeId: input.objectTypeId, name: input.name, type: input.type, config: input.config, createdBy: userId };
}

export async function updateView(viewId: string, input: UpdateViewInput): Promise<View> {
  const patch: Partial<typeof views.$inferInsert> = {};
  if (input.name !== undefined) patch.name = input.name;
  if (input.config !== undefined) patch.config = JSON.stringify(input.config);
  await db.update(views).set(patch).where(eq(views.id, viewId));
  return getView(viewId);
}

export async function deleteView(viewId: string): Promise<void> {
  await db.delete(views).where(eq(views.id, viewId));
}
