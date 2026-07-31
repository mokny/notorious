import { eq, and, isNull, desc } from "drizzle-orm";
import type { CreateBlockInput, UpdateBlockInput, MoveBlockInput, RestoreBlockInput, Block, BlockHistoryEntry } from "@notorious/shared";
import { db } from "../../db/client.js";
import { blocks, objects, blockHistory } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { notFound, badRequest } from "../../lib/httpError.js";
import { positionBetween } from "../../lib/position.js";
import { reindexObjectBody } from "../search/indexer.js";
import { createRelation, deleteRelationByTriple, getObjectWorkspaceId } from "../objects/service.js";
import { listProperties } from "../schema/service.js";
import { SUB_OBJECTS_PROPERTY_KEY } from "../schema/subObjects.js";

function toBlock(row: typeof blocks.$inferSelect): Block {
  return {
    id: row.id,
    objectId: row.objectId,
    parentBlockId: row.parentBlockId,
    type: row.type as Block["type"],
    content: JSON.parse(row.content),
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

/** Most-recent-first, capped at 10 - see recordAndBroadcast/recordBlockHistory, which already trims the table itself to the same limit at write time. */
export async function listBlockHistory(blockId: string): Promise<BlockHistoryEntry[]> {
  const rows = await db
    .select()
    .from(blockHistory)
    .where(eq(blockHistory.blockId, blockId))
    .orderBy(desc(blockHistory.createdAt))
    .limit(10);
  return rows.map((row) => ({
    id: row.id,
    blockId: row.blockId,
    actorName: row.actorName,
    action: row.action as BlockHistoryEntry["action"],
    summary: row.summary,
    createdAt: row.createdAt,
  }));
}

export async function listBlocks(objectId: string): Promise<Block[]> {
  const rows = await db
    .select()
    .from(blocks)
    .where(eq(blocks.objectId, objectId))
    .orderBy(blocks.position);
  return rows.map(toBlock);
}

async function siblings(objectId: string, parentBlockId: string | null) {
  const condition = parentBlockId
    ? and(eq(blocks.objectId, objectId), eq(blocks.parentBlockId, parentBlockId))
    : and(eq(blocks.objectId, objectId), isNull(blocks.parentBlockId));

  return db.select().from(blocks).where(condition).orderBy(blocks.position);
}

async function positionForInsert(
  objectId: string,
  parentBlockId: string | null,
  afterBlockId: string | null | undefined,
): Promise<string> {
  const rows = await siblings(objectId, parentBlockId);

  if (!afterBlockId) {
    return positionBetween(null, rows[0]?.position ?? null);
  }

  const index = rows.findIndex((row) => row.id === afterBlockId);
  const after = rows[index];
  const before = rows[index + 1];
  return positionBetween(after?.position ?? null, before?.position ?? null);
}

async function touchObject(objectId: string): Promise<void> {
  const rows = await db.select({ title: objects.title }).from(objects).where(eq(objects.id, objectId)).limit(1);
  await db.update(objects).set({ updatedAt: nowIso() }).where(eq(objects.id, objectId));
  if (rows[0]) await reindexObjectBody(objectId, rows[0].title);
}

function subObjectTargetOf(content: string): string | null {
  const parsed = JSON.parse(content) as { objectId?: string | null };
  return parsed.objectId ?? null;
}

/** The "sub_objects" relation property id for whatever object type `hostObjectId` belongs to - every type has exactly one (see schema/subObjects.ts), so this is never ambiguous. */
async function subObjectsPropertyIdFor(hostObjectId: string): Promise<string | null> {
  const rows = await db.select({ objectTypeId: objects.objectTypeId }).from(objects).where(eq(objects.id, hostObjectId)).limit(1);
  const objectTypeId = rows[0]?.objectTypeId;
  if (!objectTypeId) return null;
  const props = await listProperties(objectTypeId);
  return props.find((p) => p.key === SUB_OBJECTS_PROPERTY_KEY)?.id ?? null;
}

/** True if some *other* sub_object block inside `hostObjectId` still embeds `targetObjectId` - i.e. whether unlinking it would be premature. */
async function hasOtherSubObjectBlockReferencing(hostObjectId: string, targetObjectId: string, excludeBlockId: string | null): Promise<boolean> {
  const rows = await db
    .select({ id: blocks.id, content: blocks.content })
    .from(blocks)
    .where(and(eq(blocks.objectId, hostObjectId), eq(blocks.type, "sub_object")));
  return rows.some((row) => row.id !== excludeBlockId && subObjectTargetOf(row.content) === targetObjectId);
}

/**
 * Keeps the "sub_objects" relation in sync with which objects are actually
 * embedded via a sub_object block, so linking/unlinking one is a side effect
 * of adding/removing the block instead of a separate manual step (see
 * `createBlock`/`updateBlock`/`deleteBlock`/`restoreBlock` below, the only
 * callers). Unlinking only happens once *no* sub_object block in this
 * object references the target anymore - the same object can legitimately
 * be embedded by more than one block, and a relation added by hand through
 * SubObjectsPanel's own picker (unrelated to any block) is never touched
 * here, since nothing here ever runs unless a sub_object block itself
 * changed.
 */
async function syncSubObjectRelation(hostObjectId: string, previousTarget: string | null, nextTarget: string | null, blockId: string | null): Promise<void> {
  if (previousTarget === nextTarget) return;

  if (previousTarget && !(await hasOtherSubObjectBlockReferencing(hostObjectId, previousTarget, blockId))) {
    const propertyId = await subObjectsPropertyIdFor(hostObjectId);
    if (propertyId) await deleteRelationByTriple(propertyId, hostObjectId, previousTarget);
  }

  if (nextTarget) {
    const propertyId = await subObjectsPropertyIdFor(hostObjectId);
    if (propertyId) {
      const workspaceId = await getObjectWorkspaceId(hostObjectId);
      await createRelation(workspaceId, { propertyId, sourceObjectId: hostObjectId, targetObjectId: nextTarget });
    }
  }
}

export async function createBlock(input: CreateBlockInput): Promise<Block> {
  const id = newId();
  const now = nowIso();
  const position = await positionForInsert(input.objectId, input.parentBlockId, input.afterBlockId);

  await db.insert(blocks).values({
    id,
    objectId: input.objectId,
    parentBlockId: input.parentBlockId,
    type: input.type,
    content: JSON.stringify(input.content),
    position,
    createdAt: now,
    updatedAt: now,
  });

  await touchObject(input.objectId);

  if (input.type === "sub_object") {
    const targetObjectId = (input.content as { objectId?: string | null }).objectId ?? null;
    await syncSubObjectRelation(input.objectId, null, targetObjectId, id);
  }

  return {
    id,
    objectId: input.objectId,
    parentBlockId: input.parentBlockId,
    type: input.type,
    content: input.content,
    position,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getBlockObjectId(blockId: string): Promise<string> {
  const rows = await db.select({ objectId: blocks.objectId }).from(blocks).where(eq(blocks.id, blockId)).limit(1);
  const row = rows[0];
  if (!row) throw notFound("Block not found");
  return row.objectId;
}

export async function updateBlock(blockId: string, input: UpdateBlockInput): Promise<Block> {
  const rows = await db.select().from(blocks).where(eq(blocks.id, blockId)).limit(1);
  const row = rows[0];
  if (!row) throw notFound("Block not found");

  const updatedAt = nowIso();
  // Shallow-merged with the existing content, not replaced outright: a
  // block's content can carry fields its own type-specific editor doesn't
  // know about and never round-trips through its onSave payload - notably
  // `columnIndex`, stamped onto a block when it's created inside a Columns
  // block's column, but absent from what e.g. ParagraphBlock's onSave sends
  // (`{ markdown }`). A wholesale replace silently dropped it on the first
  // edit, which orphaned the block from every column's filtered view -
  // exactly the "typing makes the block vanish" bug this guards against.
  const content =
    input.content !== undefined ? JSON.stringify({ ...JSON.parse(row.content), ...input.content }) : row.content;
  await db.update(blocks).set({ content, updatedAt }).where(eq(blocks.id, blockId));
  await touchObject(row.objectId);

  if (row.type === "sub_object") {
    await syncSubObjectRelation(row.objectId, subObjectTargetOf(row.content), subObjectTargetOf(content), blockId);
  }

  return toBlock({ ...row, content, updatedAt });
}

/**
 * Flips a single checklist item's `checked` field, leaving the rest of the
 * block's content untouched. Deliberately separate from `updateBlock` -
 * callers use it specifically because it's exempt from the object-lock
 * check (see workspaces/access.ts's `allowWhenLocked`), and that exemption
 * needs to stay narrowly scoped to "toggle one item's checkbox", not open up
 * every other kind of checklist edit (text, add/remove, reorder) while locked.
 */
export async function toggleChecklistItem(blockId: string, itemId: string, checked: boolean): Promise<Block> {
  const rows = await db.select().from(blocks).where(eq(blocks.id, blockId)).limit(1);
  const row = rows[0];
  if (!row) throw notFound("Block not found");
  if (row.type !== "checklist") throw badRequest("Not a checklist block");

  const parsed = JSON.parse(row.content) as { items?: Array<{ id?: string; checked: boolean }> };
  const items = parsed.items ?? [];
  if (!items.some((item) => item.id === itemId)) throw notFound("Checklist item not found");

  const updatedAt = nowIso();
  const content = JSON.stringify({
    ...parsed,
    items: items.map((item) => (item.id === itemId ? { ...item, checked } : item)),
  });
  await db.update(blocks).set({ content, updatedAt }).where(eq(blocks.id, blockId));
  await touchObject(row.objectId);

  return toBlock({ ...row, content, updatedAt });
}

export async function moveBlock(blockId: string, input: MoveBlockInput): Promise<Block> {
  const rows = await db.select().from(blocks).where(eq(blocks.id, blockId)).limit(1);
  const row = rows[0];
  if (!row) throw notFound("Block not found");

  const position = await positionForInsert(row.objectId, input.parentBlockId, input.afterBlockId);
  const updatedAt = nowIso();
  await db
    .update(blocks)
    .set({ parentBlockId: input.parentBlockId, position, updatedAt })
    .where(eq(blocks.id, blockId));
  await touchObject(row.objectId);

  return toBlock({ ...row, parentBlockId: input.parentBlockId, position, updatedAt });
}

export async function deleteBlock(blockId: string): Promise<void> {
  const rows = await db.select().from(blocks).where(eq(blocks.id, blockId)).limit(1);
  const row = rows[0];
  if (!row) throw notFound("Block not found");

  await db.delete(blocks).where(eq(blocks.id, blockId));
  await touchObject(row.objectId);

  if (row.type === "sub_object") {
    await syncSubObjectRelation(row.objectId, subObjectTargetOf(row.content), null, blockId);
  }
}

/**
 * Re-inserts a block with its original id and position (see
 * `restoreBlockSchema`'s doc comment for why this exists instead of just
 * calling `createBlock` again) - the editor's undo/redo is the only caller,
 * either bringing back a just-deleted block or redoing a create that was
 * just undone.
 */
export async function restoreBlock(input: RestoreBlockInput): Promise<Block> {
  const now = nowIso();
  await db.insert(blocks).values({
    id: input.id,
    objectId: input.objectId,
    parentBlockId: input.parentBlockId,
    type: input.type,
    content: JSON.stringify(input.content),
    position: input.position,
    createdAt: now,
    updatedAt: now,
  });
  await touchObject(input.objectId);

  if (input.type === "sub_object") {
    const targetObjectId = (input.content as { objectId?: string | null }).objectId ?? null;
    await syncSubObjectRelation(input.objectId, null, targetObjectId, input.id);
  }

  return {
    id: input.id,
    objectId: input.objectId,
    parentBlockId: input.parentBlockId,
    type: input.type,
    content: input.content,
    position: input.position,
    createdAt: now,
    updatedAt: now,
  };
}

export interface BlockTreeNode {
  type: Block["type"];
  content: Record<string, unknown>;
  children?: BlockTreeNode[];
}

/** Wipes and rebuilds an object's entire block tree in one go - used by Markdown import. */
export async function replaceAllBlocks(objectId: string, tree: BlockTreeNode[]): Promise<void> {
  await db.delete(blocks).where(eq(blocks.objectId, objectId));

  const rows: (typeof blocks.$inferInsert)[] = [];
  const now = nowIso();

  const insertLevel = (nodes: BlockTreeNode[], parentBlockId: string | null): void => {
    let previousPosition: string | null = null;
    for (const node of nodes) {
      const position = positionBetween(previousPosition, null);
      previousPosition = position;
      const id = newId();
      rows.push({
        id,
        objectId,
        parentBlockId,
        type: node.type,
        content: JSON.stringify(node.content),
        position,
        createdAt: now,
        updatedAt: now,
      });
      if (node.children && node.children.length > 0) insertLevel(node.children, id);
    }
  };

  insertLevel(tree, null);
  for (const row of rows) await db.insert(blocks).values(row);

  await touchObject(objectId);
}
