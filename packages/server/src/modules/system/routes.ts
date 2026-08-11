import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";
import { getRegistrationEnabled, getRequire2faEnabled, getCallsEnabled } from "../instanceSettings/service.js";
import { passkeysEnabled } from "../../env.js";

// Same "repo root" resolution as app.ts's PACKAGE_ROOT (packages/server/src -> up three).
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const version = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as { version: string }).version;

/** Unauthenticated on purpose - a version number isn't sensitive, and the update-check UI (Settings) needs it before/without necessarily depending on auth state. */
export async function registerSystemRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/version", async () => ({ version }));

  // Unauthenticated on purpose - the register/login pages need it before any
  // session exists, to show whether open sign-up is currently allowed (see
  // RegisterPage.tsx). Doesn't reveal anything sensitive either way.
  app.get("/api/v1/system/registration-status", async () => ({ enabled: await getRegistrationEnabled() }));

  // Unauthenticated on purpose, same reasoning as registration-status above -
  // App.tsx's RequireAuth needs this to decide whether to redirect a logged-in
  // user without 2FA set up to /setup-2fa, and that check has to work the
  // instant a session exists (including right after registering).
  app.get("/api/v1/system/2fa-required", async () => ({ required: await getRequire2faEnabled() }));

  // Unauthenticated on purpose, same reasoning as the two above - lets the
  // web client hide the call button entirely rather than showing one that
  // 503s (the real enforcement is still server-side, on every calls route).
  app.get("/api/v1/system/calls-status", async () => ({ enabled: await getCallsEnabled() }));

  // Unauthenticated on purpose, same reasoning as the other status endpoints above - lets
  // LoginPage.tsx/SecuritySettings.tsx hide passkey UI entirely instead of showing one that
  // always 400s (see env.ts's `passkeysEnabled` - off until APP_ORIGIN is set in `.env`).
  app.get("/api/v1/system/passkeys-status", async () => ({ enabled: passkeysEnabled }));
}
