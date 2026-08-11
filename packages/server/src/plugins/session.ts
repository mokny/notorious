import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq, gt, and, ne, desc } from "drizzle-orm";
import type { Session } from "@notorious/shared";
import { db } from "../db/client.js";
import { sessions, users } from "../db/schema.js";
import { newId, nowIso } from "../lib/ids.js";
import { unauthorized } from "../lib/httpError.js";
import { authenticateApiKey } from "../modules/apiKeys/service.js";
import { resolveShareToken, type ResolvedShare } from "../modules/shareLinks/service.js";
import { env } from "../env.js";

const SESSION_COOKIE = "notorious_sid";
// A session is "infinite" for a device that's actually still in use: rather
// than a fixed expiry counted from login, expiresAt keeps rolling forward by
// this many days from whenever the device was last seen (see
// `maybeRenewSession` below) - it only ever truly expires after this long of
// total inactivity.
const SESSION_TTL_DAYS = 30;
// Caps how often a session's expiresAt/lastSeenAt actually gets rewritten -
// renewing on literally every request would mean a DB write (plus a
// Set-Cookie on the response) per API call for an active user, which is pure
// overhead: nothing meaningfully changes about the session's validity between
// two requests an hour apart. Renewal within this window is silently skipped.
const RENEWAL_THROTTLE_MS = 24 * 60 * 60 * 1000;

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
  avatarUrl: string | null;
}

declare module "fastify" {
  interface FastifyRequest {
    user: AuthenticatedUser | null;
    /** Set when the request carries a valid `X-Share-Token` header - an anonymous visitor following a share link, see `modules/shareLinks`. */
    shareAccess: ResolvedShare | null;
  }
}

/**
 * Resolves the current user from the session cookie on every request, and
 * provides `request.requireUser()` for routes that must be authenticated.
 * Sessions are stored server-side (not JWTs) so they can be revoked on logout.
 * Also resolves a share token (if present and no session/API key won) into
 * `request.shareAccess`, for the small set of routes that accept anonymous
 * share-link access alongside normal membership - see
 * `modules/workspaces/access.ts`'s `requireAccess`. Normally carried as an
 * `X-Share-Token` header (see lib/api/client.ts on the frontend), but also
 * accepted as a `?shareToken=` query param for the handful of requests that
 * can't attach custom headers - plain `<img src>` loads (object/workspace
 * icons, covers, image blocks) and the WebSocket handshake.
 */
export const sessionPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest("user", null);
  app.decorateRequest("shareAccess", null);

  app.addHook("onRequest", async (request, reply) => {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      request.user = await authenticateApiKey(authHeader.slice("Bearer ".length));
      return;
    }

    const sid = request.cookies[SESSION_COOKIE];
    if (sid) {
      const rows = await db
        .select({
          userId: users.id,
          email: users.email,
          name: users.name,
          avatarColor: users.avatarColor,
          avatarUrl: users.avatarUrl,
          lastSeenAt: sessions.lastSeenAt,
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(and(eq(sessions.id, sid), gt(sessions.expiresAt, nowIso())))
        .limit(1);

      const row = rows[0];
      if (row) {
        request.user = { id: row.userId, email: row.email, name: row.name, avatarColor: row.avatarColor, avatarUrl: row.avatarUrl };
        await maybeRenewSession(sid, row.lastSeenAt, reply);
        return;
      }
    }

    const headerToken = request.headers["x-share-token"];
    const queryToken = (request.query as { shareToken?: string } | undefined)?.shareToken;
    const shareToken = typeof headerToken === "string" ? headerToken : queryToken;
    if (typeof shareToken === "string") {
      request.shareAccess = await resolveShareToken(shareToken);
    }
  });
});

export function requireUser(request: FastifyRequest): AuthenticatedUser {
  if (!request.user) throw unauthorized();
  return request.user;
}

/**
 * The requesting browser tab's self-generated id (see `lib/ws/clientId.ts`
 * on the frontend), used to let that same tab's own realtime broadcast skip
 * itself without also skipping the user's other open tabs.
 */
export function getClientId(request: FastifyRequest): string | undefined {
  const header = request.headers["x-client-id"];
  return typeof header === "string" ? header : undefined;
}

/** Rewrites expiresAt/lastSeenAt (and refreshes the cookie's own maxAge to match) if this session hasn't been renewed in the last RENEWAL_THROTTLE_MS - see the constant's doc comment. A no-op otherwise, which is the common case for an actively-browsing user. */
async function maybeRenewSession(sid: string, lastSeenAt: string | null, reply: FastifyReply): Promise<void> {
  const lastSeenMs = lastSeenAt ? new Date(lastSeenAt).getTime() : 0;
  if (Date.now() - lastSeenMs < RENEWAL_THROTTLE_MS) return;

  const now = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await db.update(sessions).set({ expiresAt, lastSeenAt: now }).where(eq(sessions.id, sid));

  reply.setCookie(SESSION_COOKIE, sid, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function createSession(reply: FastifyReply, userId: string): Promise<void> {
  const id = newId();
  const now = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const userAgentHeader = reply.request.headers["user-agent"];
  await db.insert(sessions).values({
    id,
    userId,
    expiresAt,
    createdAt: now,
    lastSeenAt: now,
    userAgent: typeof userAgentHeader === "string" ? userAgentHeader : null,
    ip: reply.request.ip,
  });

  reply.setCookie(SESSION_COOKIE, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

/** The raw session-cookie id backing `request.user`, if the request was authenticated that way (not an API key) - used by the WS handshake (see realtime/routes.ts) to target this exact device for a forced logout, see `revokeSession`/`sendToSession` in modules/realtime/hub.ts. */
export function getSessionId(request: FastifyRequest): string | undefined {
  return request.cookies[SESSION_COOKIE];
}

/** This account's active sessions ("devices"), most recently active first - powers the device list in Settings > Security. */
export async function listSessions(request: FastifyRequest, userId: string): Promise<Session[]> {
  const currentSid = getSessionId(request);
  const rows = await db.select().from(sessions).where(eq(sessions.userId, userId)).orderBy(desc(sessions.lastSeenAt));
  return rows.map((row) => ({
    id: row.id,
    userAgent: row.userAgent,
    ip: row.ip,
    createdAt: row.createdAt,
    lastSeenAt: row.lastSeenAt,
    isCurrent: row.id === currentSid,
  }));
}

/** Signs out one specific device by session id - the targeted counterpart to `invalidateOtherSessions`. Scoped to `userId` so one account can never revoke another's session by guessing an id. Returns whether the revoked session was the caller's own current one (routes.ts uses this to also clear the cookie on this response, rather than just leaving a device to discover it's logged out on its next request). */
export async function revokeSession(request: FastifyRequest, userId: string, sessionId: string): Promise<{ wasCurrent: boolean }> {
  const currentSid = getSessionId(request);
  await db.delete(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
  return { wasCurrent: sessionId === currentSid };
}

export async function destroySession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sid = request.cookies[SESSION_COOKIE];
  if (sid) {
    await db.delete(sessions).where(eq(sessions.id, sid));
  }
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

/**
 * Signs out every *other* session for this account - called after a password
 * change (see auth/routes.ts), on the assumption that changing the password
 * may be the user reacting to a compromised session elsewhere, and from the
 * "Log out all other devices" button in Settings > Security. The session
 * making the request itself is left alone, so this never also logs out the
 * tab it was triggered from. Returns the revoked session ids so the caller
 * can push a live forced-logout to each (see `sendToSession` in
 * modules/realtime/hub.ts) - password-change doesn't bother with that (the
 * new password itself already invalidates whatever those sessions could do),
 * but the explicit device-list action does.
 */
export async function invalidateOtherSessions(request: FastifyRequest, userId: string): Promise<string[]> {
  const currentSid = request.cookies[SESSION_COOKIE];
  const condition = currentSid ? and(eq(sessions.userId, userId), ne(sessions.id, currentSid)) : eq(sessions.userId, userId);
  const toRevoke = await db.select({ id: sessions.id }).from(sessions).where(condition);
  await db.delete(sessions).where(condition);
  return toRevoke.map((row) => row.id);
}
