import { eq, and, isNull } from "drizzle-orm";
import type { CreateBlockInput, UpdateBlockInput, MoveBlockInput, Block } from "@notorious/shared";
import { db } from "../../db/client.js";
import { blocks, objects } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { notFound } from "../../lib/httpError.js";
import { positionBetween } from "../../lib/position.js";
import { reindexObjectBody } from "../search/indexer.js";

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
  const content = input.content !== undefined ? JSON.stringify(input.content) : row.content;
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
