import { createHash, randomBytes } from "node:crypto";
import { eq, and } from "drizzle-orm";
import type { ApiKey, CreatedApiKey } from "@notorious/shared";
import { db } from "../../db/client.js";
import { apiKeys, users } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { notFound } from "../../lib/httpError.js";
import type { AuthenticatedUser } from "../../plugins/session.js";

const TOKEN_PREFIX = "ntr_";

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function toApiKey(row: typeof apiKeys.$inferSelect): ApiKey {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    keyPrefix: row.keyPrefix,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

/** Creates a new API key for a user. The plaintext token is returned only this once. */
export async function createApiKey(userId: string, name: string): Promise<CreatedApiKey> {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString("hex")}`;
  const id = newId();
  const createdAt = nowIso();
  const keyPrefix = token.slice(0, 12);

  await db.insert(apiKeys).values({
    id,
    userId,
    name,
    keyHash: hashToken(token),
    keyPrefix,
    createdAt,
    lastUsedAt: null,
  });

  return { id, userId, name, keyPrefix, createdAt, lastUsedAt: null, token };
}

export async function listApiKeys(userId: string): Promise<ApiKey[]> {
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.userId, userId));
  return rows.map(toApiKey);
}

export async function revokeApiKey(userId: string, id: string): Promise<void> {
  const rows = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
    .limit(1);
  if (!rows[0]) throw notFound("API key not found");

  await db.delete(apiKeys).where(eq(apiKeys.id, id));
}

/**
 * Resolves a Bearer token to the user it belongs to, updating `last_used_at`
 * along the way. Used by the session plugin as an alternative to the cookie.
 */
export async function authenticateApiKey(token: string): Promise<AuthenticatedUser | null> {
  if (!token.startsWith(TOKEN_PREFIX)) return null;

  const rows = await db
    .select({
      keyId: apiKeys.id,
      userId: users.id,
      email: users.email,
      name: users.name,
      avatarColor: users.avatarColor,
    })
    .from(apiKeys)
    .innerJoin(users, eq(apiKeys.userId, users.id))
    .where(eq(apiKeys.keyHash, hashToken(token)))
    .limit(1);

  const row = rows[0];
  if (!row) return null;

  await db.update(apiKeys).set({ lastUsedAt: nowIso() }).where(eq(apiKeys.id, row.keyId));

  return { id: row.userId, email: row.email, name: row.name, avatarColor: row.avatarColor };
}
