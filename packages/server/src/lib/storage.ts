import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { newId } from "./ids.js";
import { env } from "../env.js";

export function absoluteStoragePath(storagePath: string): string {
  return path.join(env.filesDir, storagePath);
}

/**
 * Low-level disk write shared by any module that stores uploaded bytes under
 * `env.filesDir` - extracted from `files/service.ts::saveUploadedFile` so
 * `chat/service.ts::saveChatAttachment` can reuse the exact same
 * safe-filename/mkdir/write behavior with a different subpath layout
 * (`chat/<conversationId>/...` instead of `<workspaceId>/...`), without
 * chat attachments needing a row in the `files` table (whose `workspaceId`
 * is `NOT NULL` and wouldn't fit a DM).
 */
export async function writeUploadedBytes(
  subpath: string,
  filename: string,
  buffer: Buffer,
): Promise<{ id: string; storagePath: string }> {
  const id = newId();
  const safeName = filename.replace(/[^\w.-]+/g, "_");
  const storagePath = path.join(subpath, `${id}-${safeName}`);
  const fullPath = absoluteStoragePath(storagePath);

  await fsp.mkdir(path.dirname(fullPath), { recursive: true });
  await fsp.writeFile(fullPath, buffer);

  return { id, storagePath };
}

export async function deleteUploadedBytes(storagePath: string): Promise<void> {
  const fullPath = absoluteStoragePath(storagePath);
  if (fs.existsSync(fullPath)) await fsp.unlink(fullPath);
}

/** Recursively removes an entire subpath (e.g. `chat/<conversationId>/`) - used when a conversation/channel is deleted rather than one file at a time. */
export async function deleteUploadedSubpath(subpath: string): Promise<void> {
  const fullPath = absoluteStoragePath(subpath);
  await fsp.rm(fullPath, { recursive: true, force: true });
}
