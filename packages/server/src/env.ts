import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const serverRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
export const repoRoot = path.resolve(serverRoot, "..", "..");
/** The single `.env` file every part of this app reads from - see the dotenv.config call below. Exported so scripts that need to read-modify-write it (e.g. scripts/setupCalls.ts) resolve the exact same path instead of re-deriving it. */
export const envFilePath = path.join(repoRoot, ".env");

// Load from the repo-root .env explicitly (not dotenv's default of
// process.cwd()) so `npm run <script> --workspace=packages/server` - which
// npm runs with its cwd set to packages/server - still finds the same single
// .env file documented in the README/DEPLOYMENT.md, regardless of which
// directory the command was invoked from.
dotenv.config({ path: envFilePath });

function resolveFromServerRoot(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(serverRoot, value);
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  databasePath: resolveFromServerRoot(process.env.DATABASE_PATH ?? "../../data/notorious.db"),
  filesDir: resolveFromServerRoot(process.env.FILES_DIR ?? "../../data/files"),
  shareInboxDir: resolveFromServerRoot(process.env.SHARE_INBOX_DIR ?? "../../data/share-inbox"),
  backupsDir: resolveFromServerRoot(process.env.BACKUPS_DIR ?? "../../data/backups"),
  sessionSecret: process.env.SESSION_SECRET ?? "dev-only-insecure-secret-change-me",
  // Deliberately NOT tied to isProduction: the "Secure" cookie attribute makes
  // browsers silently refuse to store/send the cookie over a plain HTTP
  // connection, which would break login on any server accessed via a real
  // hostname/IP before HTTPS is set up (see docs/DEPLOYMENT.md). Only enable
  // this once a reverse proxy actually terminates TLS in front of the app.
  cookieSecure: process.env.COOKIE_SECURE === "true",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
  // The exact public origin (scheme + hostname + optional port, no trailing
  // slash) this instance is reachable at - required for WebAuthn/passkeys
  // (see modules/webauthn/service.ts), which cryptographically bind a
  // credential to the origin it was registered from. Deliberately no
  // fallback to `webOrigin`/localhost: a passkey registered under the wrong
  // origin would silently stop working the moment the operator points a
  // real domain at the app, so instead the whole feature stays off
  // (`passkeysEnabled` below) until this is explicitly set in `.env` (see
  // docs/DEPLOYMENT.md).
  appOrigin: process.env.APP_ORIGIN ?? null,
  // Calls are gated by instance_settings.calls_enabled (a DB flag, off by
  // default), not by whether these are set - an operator flips the flag
  // only after running `npm run setup-calls`, which writes these itself.
  // `mediaAnnouncedIp` has no safe default: it's the public IP/domain
  // mediasoup's WebRtcServer advertises to peers, and getting this wrong
  // (or omitting it) is exactly the "worked locally, silently dead over
  // the internet" bug class that broke the previous coturn-based setup -
  // see modules/calls/sfu.ts, which hard-fails rather than starting with
  // this unset while calls are enabled.
  mediaPort: Number(process.env.MEDIA_PORT ?? 4001),
  mediaAnnouncedIp: process.env.MEDIA_ANNOUNCED_IP ?? "",
};

/** Whether passkeys can be used at all on this instance - see `env.appOrigin`'s doc comment. Checked by every modules/webauthn/ route (registerWebauthnRoutes throws before doing anything else if this is false) and exposed unauthenticated via GET /api/v1/system/passkeys-status so the frontend can hide the passkey UI instead of showing one that always errors. */
export const passkeysEnabled = env.appOrigin !== null;
