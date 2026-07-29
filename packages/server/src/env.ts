import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const serverRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const repoRoot = path.resolve(serverRoot, "..", "..");

// Load from the repo-root .env explicitly (not dotenv's default of
// process.cwd()) so `npm run <script> --workspace=packages/server` - which
// npm runs with its cwd set to packages/server - still finds the same single
// .env file documented in the README/DEPLOYMENT.md, regardless of which
// directory the command was invoked from.
dotenv.config({ path: path.join(repoRoot, ".env") });

function resolveFromServerRoot(value: string): string {
  return path.isAbsolute(value) ? value : path.resolve(serverRoot, value);
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  isProduction: process.env.NODE_ENV === "production",
  databasePath: resolveFromServerRoot(process.env.DATABASE_PATH ?? "../../data/notorious.db"),
  filesDir: resolveFromServerRoot(process.env.FILES_DIR ?? "../../data/files"),
  sessionSecret: process.env.SESSION_SECRET ?? "dev-only-insecure-secret-change-me",
  vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? "",
  vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? "",
  vapidSubject: process.env.VAPID_SUBJECT ?? "mailto:admin@example.com",
  webOrigin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
};
