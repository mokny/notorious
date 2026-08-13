import type { FastifyInstance } from "fastify";
import { registerSchema, loginSchema, changePasswordSchema, changeEmailSchema, updatePushPreferencesSchema, updateLocaleSchema, reverifyPasswordSchema } from "@notorious/shared";
import { registerUser, verifyCredentials, getUserById, canRegisterEmail, changePassword, changeEmail, updatePushPreferences, updateLocale } from "./service.js";
import { createSession, destroySession, requireUser, invalidateOtherSessions, listSessions, revokeSession } from "../../plugins/session.js";
import { sendToSession } from "../realtime/hub.js";
import { forbidden } from "../../lib/httpError.js";
import { env } from "../../env.js";
import { createPendingChallenge, PENDING_TOTP_COOKIE } from "../twoFactor/service.js";
import { reverifyWithPassword, markSudoVerified } from "../reverify/service.js";

const PENDING_TOTP_TTL_SECONDS = 5 * 60;

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/auth/register", async (request, reply) => {
    const input = registerSchema.parse(request.body);

    // Self-registration is disabled by default (see modules/instanceSettings) -
    // an admin enables it instance-wide via `npm run enable-registration`, or
    // a workspace owner can invite a specific email regardless of that
    // setting: this only blocks *unsolicited* sign-ups, not redeeming an
    // invite you were actually sent. Checked only for this public endpoint -
    // `scripts/createUser.ts` calls `registerUser` directly and is unaffected.
    if (!(await canRegisterEmail(input.email))) {
      throw forbidden(
        "Registration is currently disabled on this instance. If you were invited to a workspace, make sure you're using the email address the invite was sent to.",
      );
    }

    const user = await registerUser(input);
    await createSession(reply, user.id);
    reply.code(201);
    return user;
  });

  app.post("/api/v1/auth/login", async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const user = await verifyCredentials(input);

    // Password is correct, but that's only step one when 2FA is set up - a
    // real session isn't created yet, just a short-lived "waiting for the
    // code" marker (see modules/twoFactor/service.ts's doc comment on why
    // this is its own cookie/table, not a `sessions` row). The frontend
    // shows a second form (LoginPage.tsx) that posts to
    // POST /api/v1/auth/2fa/verify, which creates the real session on success.
    if (user.totpEnabled) {
      const challengeId = await createPendingChallenge(user.id);
      reply.setCookie(PENDING_TOTP_COOKIE, challengeId, {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: env.cookieSecure,
        maxAge: PENDING_TOTP_TTL_SECONDS,
      });
      return { pending2fa: true as const };
    }

    await createSession(reply, user.id);
    return user;
  });

  app.post("/api/v1/auth/logout", async (request, reply) => {
    await destroySession(request, reply);
    reply.code(204);
  });

  app.get("/api/v1/auth/me", async (request, reply) => {
    const authUser = requireUser(request);
    const user = await getUserById(authUser.id);
    if (!user) {
      reply.code(401);
      return { message: "Session is no longer valid" };
    }
    return user;
  });

  app.patch("/api/v1/auth/password", async (request, reply) => {
    const user = requireUser(request);
    const input = changePasswordSchema.parse(request.body);
    await changePassword(user.id, input);
    // Anyone else's (or an attacker's) session on this account is signed out
    // the moment the password changes - see invalidateOtherSessions's doc
    // comment. This tab's own session is left alone.
    await invalidateOtherSessions(request, user.id);
    reply.code(204);
  });

  app.get("/api/v1/auth/sessions", async (request) => {
    const user = requireUser(request);
    return listSessions(request, user.id);
  });

  app.delete("/api/v1/auth/sessions", async (request, reply) => {
    const user = requireUser(request);
    const revokedIds = await invalidateOtherSessions(request, user.id);
    for (const id of revokedIds) sendToSession(id, { type: "sessionRevoked" });
    reply.code(204);
  });

  app.delete("/api/v1/auth/sessions/:id", async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const { wasCurrent } = await revokeSession(request, user.id, id);
    if (wasCurrent) {
      await destroySession(request, reply);
    } else {
      sendToSession(id, { type: "sessionRevoked" });
    }
    reply.code(204);
  });

  app.patch("/api/v1/auth/email", async (request) => {
    const user = requireUser(request);
    const input = changeEmailSchema.parse(request.body);
    return changeEmail(user.id, input);
  });

  app.patch("/api/v1/auth/push-preferences", async (request) => {
    const user = requireUser(request);
    const input = updatePushPreferencesSchema.parse(request.body);
    return updatePushPreferences(user.id, input);
  });

  app.patch("/api/v1/auth/locale", async (request) => {
    const user = requireUser(request);
    const input = updateLocaleSchema.parse(request.body);
    return updateLocale(user.id, input);
  });

  // The password branch of "sudo mode" reverification (see modules/reverify/service.ts)
  // - the passkey branch is POST /api/v1/webauthn/reverify/verify instead, since it needs
  // a WebAuthn ceremony (options -> browser assertion -> verify) rather than a single call.
  app.post("/api/v1/auth/reverify", async (request, reply) => {
    const user = requireUser(request);
    const input = reverifyPasswordSchema.parse(request.body);
    await reverifyWithPassword(user.id, input.password);
    await markSudoVerified(request);
    reply.code(204);
  });
}
