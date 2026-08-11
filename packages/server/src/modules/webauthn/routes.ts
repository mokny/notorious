import type { FastifyInstance } from "fastify";
import type { RegistrationResponseJSON, AuthenticationResponseJSON } from "@simplewebauthn/server";
import { renameWebauthnCredentialSchema, registerPasskeyOptionsSchema } from "@notorious/shared";
import { requireUser, createSession } from "../../plugins/session.js";
import { getUserById, canRegisterEmail, registerUserWithPasskey } from "../auth/service.js";
import { badRequest, notFound, forbidden } from "../../lib/httpError.js";
import * as webauthnService from "./service.js";

/** Registration/authentication response bodies are the full JSON shape @simplewebauthn/browser's startRegistration/startAuthentication produce - not worth hand-writing a zod schema for (see @simplewebauthn/server's own verify functions, which already validate their structure and throw a clear error on anything malformed). */
function requireResponseBody<T>(body: unknown): T {
  if (!body || typeof body !== "object") throw badRequest("Missing passkey response");
  return body as T;
}

export async function registerWebauthnRoutes(rootApp: FastifyInstance): Promise<void> {
  // Registered in its own scope (rather than adding routes to `rootApp` directly, like every
  // other `register*Routes` in this codebase does) specifically so the `onRequest` hook below is
  // scoped to just these routes - `rootApp.addHook` would otherwise apply to the entire app.
  await rootApp.register(async (app) => {
    // Every route below 400s immediately if APP_ORIGIN isn't set (see env.ts's `passkeysEnabled`
    // doc comment) - one hook instead of repeating the check in each handler.
    app.addHook("onRequest", async () => webauthnService.assertPasskeysEnabled());

    registerWebauthnHandlers(app);
  });
}

function registerWebauthnHandlers(app: FastifyInstance): void {
  // Add a new passkey to the current (already logged-in) account.
  app.post("/api/v1/webauthn/register/options", async (request, reply) => {
    const user = requireUser(request);
    return webauthnService.generateRegistrationOptionsForUser(reply, user.id, user.email, user.name);
  });

  app.post("/api/v1/webauthn/register/verify", async (request, reply) => {
    const user = requireUser(request);
    const body = requireResponseBody<{ response: RegistrationResponseJSON; name?: string }>(request.body);
    reply.code(201);
    return webauthnService.verifyRegistration(request, reply, user.id, body.response, body.name);
  });

  app.get("/api/v1/webauthn/credentials", async (request) => {
    const user = requireUser(request);
    return webauthnService.listCredentials(user.id);
  });

  app.patch("/api/v1/webauthn/credentials/:id", async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const input = renameWebauthnCredentialSchema.parse(request.body);
    await webauthnService.renameCredential(user.id, id, input.name);
    reply.code(204);
  });

  app.delete("/api/v1/webauthn/credentials/:id", async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    await webauthnService.deleteCredential(user.id, id);
    reply.code(204);
  });

  // Passkey-only registration (email + name + passkey, no password) - see auth/service.ts's
  // `registerUserWithPasskey`. Public (no requireUser): this *is* the registration. Rate-limited
  // (unlike the password register endpoint) since generating WebAuthn options is more expensive
  // than a password hash check and this is reachable by anyone, not just an invited email.
  app.post(
    "/api/v1/webauthn/register-account/options",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const input = registerPasskeyOptionsSchema.parse(request.body);
      // Same self-registration gate as POST /api/v1/auth/register - see its doc comment in
      // auth/routes.ts for why this only blocks unsolicited sign-ups, not redeeming an invite.
      if (!(await canRegisterEmail(input.email))) {
        throw forbidden(
          "Registration is currently disabled on this instance. If you were invited to a workspace, make sure you're using the email address the invite was sent to.",
        );
      }
      return webauthnService.generateRegistrationOptionsForNewAccount(reply, input.email, input.name);
    },
  );

  app.post(
    "/api/v1/webauthn/register-account/verify",
    { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const body = requireResponseBody<{ response: RegistrationResponseJSON }>(request.body);
      const { email, name, credentialId, publicKey, counter, transports } = await webauthnService.verifyRegistrationForNewAccount(
        request,
        reply,
        body.response,
      );
      const user = await registerUserWithPasskey(email, name, { credentialId, publicKey, counter, transports });
      await createSession(reply, user.id);
      reply.code(201);
      return user;
    },
  );

  // Passwordless login - usernameless/conditional-UI, see generateLoginOptions's doc comment.
  // Public (no requireUser): this *is* the login.
  app.post("/api/v1/webauthn/login/options", async (_request, reply) => {
    return webauthnService.generateLoginOptions(reply);
  });

  app.post("/api/v1/webauthn/login/verify", async (request, reply) => {
    const body = requireResponseBody<{ response: AuthenticationResponseJSON }>(request.body);
    const userId = await webauthnService.verifyLoginAuthentication(request, reply, body.response);
    const user = await getUserById(userId);
    if (!user) throw notFound("Account no longer exists");
    await createSession(reply, user.id);
    return user;
  });

  // The passkey branch of "sudo mode" reverification (see modules/reverify/service.ts) -
  // the password branch is POST /api/v1/auth/reverify instead.
  app.post("/api/v1/webauthn/reverify/options", async (request, reply) => {
    const user = requireUser(request);
    return webauthnService.generateReverifyOptions(reply, user.id);
  });

  app.post("/api/v1/webauthn/reverify/verify", async (request, reply) => {
    const user = requireUser(request);
    const body = requireResponseBody<{ response: AuthenticationResponseJSON }>(request.body);
    await webauthnService.verifyReverifyAuthentication(request, reply, user.id, body.response);
    reply.code(204);
  });
}
