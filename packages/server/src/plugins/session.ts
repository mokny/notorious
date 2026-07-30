import fp from "fastify-plugin";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { eq, gt, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { sessions, users } from "../db/schema.js";
import { newId, nowIso } from "../lib/ids.js";
import { unauthorized } from "../lib/httpError.js";
import { authenticateApiKey } from "../modules/apiKeys/service.js";
import { resolveShareToken, type ResolvedShare } from "../modules/shareLinks/service.js";
import { env } from "../env.js";

const SESSION_COOKIE = "notorious_sid";
const SESSION_TTL_DAYS = 30;

export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  avatarColor: string;
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

  app.addHook("onRequest", async (request) => {
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
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(and(eq(sessions.id, sid), gt(sessions.expiresAt, nowIso())))
        .limit(1);

      const row = rows[0];
      if (row) {
        request.user = { id: row.userId, email: row.email, name: row.name, avatarColor: row.avatarColor };
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

export async function createSession(reply: FastifyReply, userId: string): Promise<void> {
  const id = newId();
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await db.insert(sessions).values({ id, userId, expiresAt, createdAt: nowIso() });

  reply.setCookie(SESSION_COOKIE, id, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env.cookieSecure,
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
  });
}

export async function destroySession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const sid = request.cookies[SESSION_COOKIE];
  if (sid) {
    await db.delete(sessions).where(eq(sessions.id, sid));
  }
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}
