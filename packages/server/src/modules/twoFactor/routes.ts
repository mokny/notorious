import type { FastifyInstance } from "fastify";
import argon2 from "argon2";
import { eq } from "drizzle-orm";
import { confirmTwoFactorSchema, disableTwoFactorSchema, verifyTwoFactorSchema } from "@notorious/shared";
import { db } from "../../db/client.js";
import { users } from "../../db/schema.js";
import { requireUser, createSession } from "../../plugins/session.js";
import { badRequest, unauthorized } from "../../lib/httpError.js";
import { getUserById } from "../auth/service.js";
import * as twoFactorService from "./service.js";
import { PENDING_TOTP_COOKIE } from "./service.js";

export async function registerTwoFactorRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/auth/2fa/setup", async (request) => {
    const user = requireUser(request);
    return twoFactorService.startSetup(user.id, user.email);
  });

  app.post("/api/v1/auth/2fa/confirm", async (request) => {
    const user = requireUser(request);
    const input = confirmTwoFactorSchema.parse(request.body);
    return twoFactorService.confirmSetup(user.id, input.code);
  });

  app.post("/api/v1/auth/2fa/disable", async (request, reply) => {
    const user = requireUser(request);
    const input = disableTwoFactorSchema.parse(request.body);

    const rows = await db.select({ passwordHash: users.passwordHash }).from(users).where(eq(users.id, user.id)).limit(1);
    const row = rows[0];
    if (!row || !(await argon2.verify(row.passwordHash, input.currentPassword))) {
      throw badRequest("Current password is incorrect");
    }

    await twoFactorService.disable(user.id);
    reply.code(204);
  });

  // Deliberately NOT gated by requireUser - at this point the browser only
  // holds the short-lived pending-2FA cookie set by auth/routes.ts's login
  // handler, not a real session yet (see PENDING_TOTP_COOKIE's doc comment).
  app.post("/api/v1/auth/2fa/verify", async (request, reply) => {
    const challengeId = request.cookies[PENDING_TOTP_COOKIE];
    if (!challengeId) throw unauthorized("No pending 2FA challenge - log in again");

    const userId = await twoFactorService.resolvePendingChallenge(challengeId);
    if (!userId) {
      reply.clearCookie(PENDING_TOTP_COOKIE, { path: "/" });
      throw unauthorized("This 2FA challenge has expired - log in again");
    }

    const input = verifyTwoFactorSchema.parse(request.body);
    const valid = input.code
      ? await twoFactorService.verifyLoginCode(userId, input.code)
      : await twoFactorService.verifyBackupCode(userId, input.backupCode!);
    if (!valid) throw unauthorized("Invalid code");

    await twoFactorService.deletePendingChallenge(challengeId);
    reply.clearCookie(PENDING_TOTP_COOKIE, { path: "/" });
    await createSession(reply, userId);

    return getUserById(userId);
  });
}
