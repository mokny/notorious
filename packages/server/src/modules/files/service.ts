import { eq } from "drizzle-orm";
import type { FileAsset } from "@notorious/shared";
import { db } from "../../db/client.js";
import { files, workspaces } from "../../db/schema.js";
import { nowIso } from "../../lib/ids.js";
import { notFound } from "../../lib/httpError.js";
import { absoluteStoragePath, writeUploadedBytes, deleteUploadedBytes } from "../../lib/storage.js";
import { maybeResizeImage, type ImageResizeLimits } from "./imageResize.js";

export { absoluteStoragePath };

/**
 * Looks up a workspace's configured resize limits directly (rather than
 * going through modules/workspaces/service.ts's `getWorkspace`) to avoid a
 * circular import - that module already imports `deleteWorkspaceFilesFromDisk`
 * from this file. Falls back to "no limit" if the workspace row is somehow
 * missing (shouldn't happen - the caller always resolves it from a real
 * upload request first).
 */
export async function getImageLimits(workspaceId: string, kind: "image" | "cover"): Promise<ImageResizeLimits> {
  const rows = await db
    .select({
      imageMaxWidth: workspaces.imageMaxWidth,
      imageMaxHeight: workspaces.imageMaxHeight,
      coverMaxWidth: workspaces.coverMaxWidth,
      coverMaxHeight: workspaces.coverMaxHeight,
      imageQuality: workspaces.imageQuality,
    })
    .from(workspaces)
    .where(eq(workspaces.id, workspaceId))
    .limit(1);
  const row = rows[0];
  if (!row) return { maxWidth: null, maxHeight: null, quality: 80 };
  return kind === "cover"
    ? { maxWidth: row.coverMaxWidth, maxHeight: row.coverMaxHeight, quality: row.imageQuality }
    : { maxWidth: row.imageMaxWidth, maxHeight: row.imageMaxHeight, quality: row.imageQuality };
}

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
  /** "cover" applies the workspace's coverMax* limits instead of its imageMax* ones - see modules/files/imageResize.ts. Defaults to "image". */
  kind?: "image" | "cover";
}): Promise<FileAsset> {
  let { filename, mimeType, buffer } = input;
  if (mimeType.startsWith("image/")) {
    const limits = await getImageLimits(input.workspaceId, input.kind === "cover" ? "cover" : "image");
    const resized = await maybeResizeImage(buffer, mimeType, filename, limits);
    if (resized) {
      buffer = resized.buffer;
      mimeType = resized.mimeType;
      filename = resized.filename;
    }
  }

  const { id, storagePath } = await writeUploadedBytes(input.workspaceId, filename, buffer);
  const createdAt = nowIso();
  await db.insert(files).values({
    id,
    workspaceId: input.workspaceId,
    objectId: input.objectId,
    blockId: input.blockId,
    filename,
    mimeType,
    size: buffer.length,
    storagePath,
    uploadedBy: input.uploadedBy,
    createdAt,
  });

  return {
    id,
    workspaceId: input.workspaceId,
    objectId: input.objectId,
    blockId: input.blockId,
    filename,
    mimeType,
    size: buffer.length,
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
