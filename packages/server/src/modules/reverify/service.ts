import { eq } from "drizzle-orm";
import argon2 from "argon2";
import type { FastifyRequest } from "fastify";
import { db } from "../../db/client.js";
import { sessions, users } from "../../db/schema.js";
import { nowIso } from "../../lib/ids.js";
import { badRequest, unauthorized } from "../../lib/httpError.js";
import { getSessionId } from "../../plugins/session.js";

/**
 * "Sudo mode" window - how long a reverify (password or passkey, see
 * modules/webauthn/service.ts's reverify ceremony) stays valid before the
 * next `requiresReverify` object access demands another one. Deliberately a
 * fixed window from the moment of reverification, not a sliding one renewed
 * by activity - see the design discussion this implements: predictable
 * expiry beats "stays open forever as long as a tab is open".
 */
const SUDO_TTL_MS = 15 * 60 * 1000;

/**
 * Whether the requesting session is currently in "sudo mode" - the one gate
 * `workspaces/access.ts`'s `requireAccess` checks before letting any request
 * through to a `requiresReverify` object. Deliberately false for anything
 * that isn't a real cookie session: an API key or MCP request has no
 * interactive way to complete a reverify ceremony, and an anonymous share
 * link has no session at all - both are meant to be refused outright, not
 * offered a reverify prompt they can never satisfy.
 */
export async function isSudoActive(request: FastifyRequest): Promise<boolean> {
  if (request.authMethod !== "session") return false;
  const sid = getSessionId(request);
  if (!sid) return false;

  const rows = await db.select({ sudoVerifiedAt: sessions.sudoVerifiedAt }).from(sessions).where(eq(sessions.id, sid)).limit(1);
  const verifiedAt = rows[0]?.sudoVerifiedAt;
  if (!verifiedAt) return false;

  return Date.now() - new Date(verifiedAt).getTime() < SUDO_TTL_MS;
}

/** Marks the requesting session as freshly reverified - called after either the password branch (below) or the passkey branch (modules/webauthn/service.ts's `verifyReverifyAuthentication`) succeeds. */
export async function markSudoVerified(request: FastifyRequest): Promise<void> {
  const sid = getSessionId(request);
  if (!sid) throw unauthorized();
  await db.update(sessions).set({ sudoVerifiedAt: nowIso() }).where(eq(sessions.id, sid));
}

/** The password branch of `POST /api/v1/auth/reverify` - deliberately just a password check (no TOTP step), see the design discussion: a passkey or a correct password is each already considered sufficient on its own for a quick re-authentication, unlike the full login flow. */
export async function reverifyWithPassword(userId: string, password: string): Promise<void> {
  const rows = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, userId)).limit(1);
  const row = rows[0];
  if (!row) throw unauthorized();
  if (row.passwordHash === null) throw badRequest("This account doesn't have a password - use passkey reverification instead");

  const valid = await argon2.verify(row.passwordHash, password);
  if (!valid) throw badRequest("Incorrect password");
}
