import { eq } from "drizzle-orm";
import type { FileAsset } from "@notorious/shared";
import { db } from "../../db/client.js";
import { files } from "../../db/schema.js";
import { nowIso } from "../../lib/ids.js";
import { notFound } from "../../lib/httpError.js";
import { absoluteStoragePath, writeUploadedBytes, deleteUploadedBytes } from "../../lib/storage.js";

export { absoluteStoragePath };

function toFileAsset(row: typeof files.$inferSelect): FileAsset {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    objectId: row.objectId,
    blockId: row.blockId,
    filename: row.filename,
    mimeType: row.mimeType,
    size: row.size,
    uploadedBy: row.uploadedBy,
    createdAt: row.createdAt,
  };
}

export async function saveUploadedFile(input: {
  workspaceId: string;
  objectId: string | null;
  blockId: string | null;
  uploadedBy: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<FileAsset> {
  const { id, storagePath } = await writeUploadedBytes(input.workspaceId, input.filename, input.buffer);
  const createdAt = nowIso();
  await db.insert(files).values({
    id,
    workspaceId: input.workspaceId,
    objectId: input.objectId,
    blockId: input.blockId,
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.buffer.length,
    storagePath,
    uploadedBy: input.uploadedBy,
    createdAt,
  });

  return {
    id,
    workspaceId: input.workspaceId,
    objectId: input.objectId,
    blockId: input.blockId,
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.buffer.length,
    uploadedBy: input.uploadedBy,
    createdAt,
  };
}

export async function getFile(id: string): Promise<{ asset: FileAsset; storagePath: string }> {
  const rows = await db.select().from(files).where(eq(files.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw notFound("File not found");
  return { asset: toFileAsset(row), storagePath: row.storagePath };
}

export async function listFilesForObject(objectId: string): Promise<FileAsset[]> {
  const rows = await db.select().from(files).where(eq(files.objectId, objectId));
  return rows.map(toFileAsset);
}

export async function deleteFile(id: string): Promise<void> {
  const rows = await db.select().from(files).where(eq(files.id, id)).limit(1);
  const row = rows[0];
  if (!row) throw notFound("File not found");

  await db.delete(files).where(eq(files.id, id));
  await deleteUploadedBytes(row.storagePath);
}

/**
 * Used only by workspace deletion, and only unlinks bytes on disk - unlike
 * `deleteFile`, it doesn't touch the DB rows itself, since `files.workspaceId`
 * already has `onDelete: cascade` and the workspace delete removes them along
 * with everything else. Has to run *before* that delete though: once the
 * workspace (and its files rows) are gone, the storage paths needed to find
 * the bytes on disk are gone too.
 */
export async function deleteWorkspaceFilesFromDisk(workspaceId: string): Promise<void> {
  const rows = await db.select({ storagePath: files.storagePath }).from(files).where(eq(files.workspaceId, workspaceId));
  await Promise.all(rows.map((row) => deleteUploadedBytes(row.storagePath)));
}
