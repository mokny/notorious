import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { and, eq, lt } from "drizzle-orm";
import type { ShareCommitInput, ShareIntakeFields, ShareInboxItem, ObjectRecord } from "@notorious/shared";
import { blockContentForFile } from "@notorious/shared";
import { db } from "../../db/client.js";
import { shareInboxItems, shareInboxFiles } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { notFound, badRequest } from "../../lib/httpError.js";
import { env } from "../../env.js";
import * as fileService from "../files/service.js";
import * as blockService from "../blocks/service.js";
import * as objectService from "../objects/service.js";
import { fetchLinkPreview } from "../linkPreview/service.js";

const SHARE_INBOX_TTL_MS = 60 * 60 * 1000;

export interface IncomingSharedFile {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

function absoluteInboxPath(storagePath: string): string {
  return path.join(env.shareInboxDir, storagePath);
}

function kindFor(fields: ShareIntakeFields, hasFiles: boolean): ShareInboxItem["kind"] {
  if (hasFiles) return "files";
  if (fields.url) return "url";
  return "text";
}

async function toInboxItem(row: typeof shareInboxItems.$inferSelect): Promise<ShareInboxItem> {
  const fileRows = await db.select().from(shareInboxFiles).where(eq(shareInboxFiles.inboxItemId, row.id));
  return {
    id: row.id,
    kind: row.kind as ShareInboxItem["kind"],
    url: row.url,
    title: row.title,
    text: row.sharedText,
    files: fileRows.map((f) => ({ id: f.id, filename: f.filename, mimeType: f.mimeType, size: f.size })),
    expiresAt: row.expiresAt,
    createdAt: row.createdAt,
  };
}

/** Sweeps expired share-inbox rows and unlinks their temp files from disk. Run on every intake (the common case) plus a periodic cron sweep (see cleanup.ts) as a safety net for abandoned shares. */
export async function cleanupExpiredInboxItems(): Promise<void> {
  const now = nowIso();
  const expiredItems = await db.select().from(shareInboxItems).where(lt(shareInboxItems.expiresAt, now));
  if (expiredItems.length === 0) return;

  for (const item of expiredItems) {
    const fileRows = await db.select().from(shareInboxFiles).where(eq(shareInboxFiles.inboxItemId, item.id));
    for (const file of fileRows) {
      try {
        const fullPath = absoluteInboxPath(file.storagePath);
        if (fs.existsSync(fullPath)) await fsp.unlink(fullPath);
      } catch {
        // Best-effort - a file already gone on disk shouldn't block cleaning up the row.
      }
    }
    await db.delete(shareInboxItems).where(eq(shareInboxItems.id, item.id));
  }
}

export async function createInboxItemFromShare(
  userId: string,
  fields: ShareIntakeFields,
  files: IncomingSharedFile[],
): Promise<{ id: string }> {
  await cleanupExpiredInboxItems();

  if (files.length === 0 && !fields.url && !fields.text) {
    throw badRequest("Nothing was shared");
  }

  const id = newId();
  const now = nowIso();
  const expiresAt = new Date(Date.now() + SHARE_INBOX_TTL_MS).toISOString();
  const kind = kindFor(fields, files.length > 0);

  await db.insert(shareInboxItems).values({
    id,
    userId,
    kind,
    url: fields.url ?? null,
    title: fields.title ?? null,
    sharedText: fields.text ?? null,
    expiresAt,
    createdAt: now,
  });

  for (const [index, file] of files.entries()) {
    const fileId = newId();
    const safeName = file.filename.replace(/[^\w.-]+/g, "_");
    const storagePath = path.join(userId, `${id}-${index}-${safeName}`);
    const fullPath = absoluteInboxPath(storagePath);
    await fsp.mkdir(path.dirname(fullPath), { recursive: true });
    await fsp.writeFile(fullPath, file.buffer);

    await db.insert(shareInboxFiles).values({
      id: fileId,
      inboxItemId: id,
      filename: file.filename,
      mimeType: file.mimeType,
      size: file.buffer.length,
      storagePath,
      createdAt: now,
    });
  }

  return { id };
}

export async function getInboxItemForUser(userId: string, id: string): Promise<ShareInboxItem> {
  const rows = await db
    .select()
    .from(shareInboxItems)
    .where(and(eq(shareInboxItems.id, id), eq(shareInboxItems.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row || row.expiresAt < nowIso()) throw notFound("This shared content has expired or was already used");
  return toInboxItem(row);
}

async function deleteInboxItem(id: string): Promise<void> {
  const fileRows = await db.select().from(shareInboxFiles).where(eq(shareInboxFiles.inboxItemId, id));
  for (const file of fileRows) {
    try {
      const fullPath = absoluteInboxPath(file.storagePath);
      if (fs.existsSync(fullPath)) await fsp.unlink(fullPath);
    } catch {
      // Best-effort disk cleanup - the row delete below is what actually matters.
    }
  }
  await db.delete(shareInboxItems).where(eq(shareInboxItems.id, id));
}

export async function commitInboxItem(
  userId: string,
  input: ShareCommitInput,
): Promise<ObjectRecord> {
  const rows = await db
    .select()
    .from(shareInboxItems)
    .where(and(eq(shareInboxItems.id, input.inboxId), eq(shareInboxItems.userId, userId)))
    .limit(1);
  const row = rows[0];
  if (!row || row.expiresAt < nowIso()) throw notFound("This shared content has expired or was already used");

  let objectId: string;
  if (input.action.kind === "create") {
    const object = await objectService.createObject(input.workspaceId, userId, {
      objectTypeId: input.action.objectTypeId,
      title: input.title,
      icon: null,
      cover: null,
      values: {},
    });
    objectId = object.id;
  } else {
    const targetWorkspaceId = await objectService.getObjectWorkspaceId(input.action.objectId);
    if (targetWorkspaceId !== input.workspaceId) throw badRequest("Object does not belong to the selected workspace");
    objectId = input.action.objectId;
  }

  const existingBlocks = await blockService.listBlocks(objectId);
  let afterBlockId = existingBlocks[existingBlocks.length - 1]?.id ?? null;

  if (row.kind === "files") {
    const fileRows = await db.select().from(shareInboxFiles).where(eq(shareInboxFiles.inboxItemId, row.id));
    for (const file of fileRows) {
      const fullPath = absoluteInboxPath(file.storagePath);
      const buffer = await fsp.readFile(fullPath);
      const asset = await fileService.saveUploadedFile({
        workspaceId: input.workspaceId,
        objectId,
        blockId: null,
        uploadedBy: userId,
        filename: file.filename,
        mimeType: file.mimeType,
        buffer,
      });
      const { type, content } = blockContentForFile(file.mimeType, file.filename, `/api/v1/files/${asset.id}`, asset.id, asset.size);
      const block = await blockService.createBlock({ objectId, parentBlockId: null, afterBlockId, type, content });
      afterBlockId = block.id;
    }
  } else if (row.kind === "url" && row.url) {
    const preview = await fetchLinkPreview(row.url).catch(() => ({ title: null, icon: null }));
    const content = { url: row.url, title: preview.title ?? row.title ?? undefined, icon: preview.icon ?? undefined };
    await blockService.createBlock({ objectId, parentBlockId: null, afterBlockId, type: "bookmark", content });
  } else if (row.sharedText) {
    await blockService.createBlock({ objectId, parentBlockId: null, afterBlockId, type: "paragraph", content: { markdown: row.sharedText } });
  }

  await deleteInboxItem(row.id);

  return objectService.getObject(objectId);
}
