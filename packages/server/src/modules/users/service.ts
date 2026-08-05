import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { badRequest, notFound } from "../../lib/httpError.js";
import { env } from "../../env.js";

const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

const MIME_EXTENSIONS: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

function avatarsDir(): string {
  return path.join(env.filesDir, "avatars");
}

/** Any of `png`/`jpg`/`webp` (whichever extension the current file was saved with, if any) - used to find and delete a previous upload whose extension may differ from the new one. */
async function findExistingAvatarPath(userId: string): Promise<string | null> {
  const dir = avatarsDir();
  for (const ext of new Set(Object.values(MIME_EXTENSIONS))) {
    const candidate = path.join(dir, `${userId}.${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Saves a freshly uploaded avatar image as-is (the client has already
 * cropped/sized it - see AccountSettings.tsx) to `<filesDir>/avatars/<userId>.<ext>`,
 * overwriting any previous upload (deleting it first if its extension
 * differs, e.g. switching from a .png to a .jpg upload), and points
 * `users.avatar_url` at a servable URL for it.
 */
export async function saveAvatar(userId: string, mimeType: string, buffer: Buffer): Promise<string> {
  const ext = MIME_EXTENSIONS[mimeType];
  if (!ext) throw badRequest("Avatar must be a PNG, JPEG, or WEBP image");
  if (buffer.length > MAX_AVATAR_SIZE) throw badRequest("Avatar must be 5MB or smaller");

  const dir = avatarsDir();
  await fsp.mkdir(dir, { recursive: true });

  const existing = await findExistingAvatarPath(userId);
  const targetPath = path.join(dir, `${userId}.${ext}`);
  if (existing && existing !== targetPath) await fsp.unlink(existing);

  await fsp.writeFile(targetPath, buffer);

  // Cache-busting query param - the URL itself is stable (userId-keyed), so
  // without this a browser that already cached the old bytes at this exact
  // path wouldn't pick up a re-upload until an unrelated hard refresh.
  const avatarUrl = `/api/v1/users/${userId}/avatar?v=${Date.now()}`;
  await db.update(users).set({ avatarUrl }).where(eq(users.id, userId));
  return avatarUrl;
}

/** Removes the current avatar file (if any) and clears `users.avatar_url`. */
export async function deleteAvatar(userId: string): Promise<void> {
  const existing = await findExistingAvatarPath(userId);
  if (existing) await fsp.unlink(existing);
  await db.update(users).set({ avatarUrl: null }).where(eq(users.id, userId));
}

/** Resolves the on-disk path + mime type for `GET /api/v1/users/:userId/avatar`. */
export async function getAvatarFile(userId: string): Promise<{ path: string; mimeType: string }> {
  const rows = await db.select({ avatarUrl: users.avatarUrl }).from(users).where(eq(users.id, userId)).limit(1);
  if (!rows[0]?.avatarUrl) throw notFound("No avatar set");

  const existing = await findExistingAvatarPath(userId);
  if (!existing) throw notFound("No avatar set");

  const ext = path.extname(existing).slice(1);
  const mimeType = Object.entries(MIME_EXTENSIONS).find(([, e]) => e === ext)?.[0] ?? "application/octet-stream";
  return { path: existing, mimeType };
}
