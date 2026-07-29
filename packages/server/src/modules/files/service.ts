import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import type { FileAsset } from "@notorious/shared";
import { db } from "../../db/client.js";
import { files } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { notFound } from "../../lib/httpError.js";
import { env } from "../../env.js";

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

export function absoluteStoragePath(storagePath: string): string {
  return path.join(env.filesDir, storagePath);
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
  const id = newId();
  const safeName = input.filename.replace(/[^\w.-]+/g, "_");
  const storagePath = path.join(input.workspaceId, `${id}-${safeName}`);
  const fullPath = absoluteStoragePath(storagePath);

  await fsp.mkdir(path.dirname(fullPath), { recursive: true });
  await fsp.writeFile(fullPath, input.buffer);

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
  const fullPath = absoluteStoragePath(row.storagePath);
  if (fs.existsSync(fullPath)) await fsp.unlink(fullPath);
}
