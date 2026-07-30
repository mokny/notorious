import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyInstance } from "fastify";

// Same "repo root" resolution as app.ts's PACKAGE_ROOT (packages/server/src -> up three).
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../..");
const version = (JSON.parse(fs.readFileSync(path.join(REPO_ROOT, "package.json"), "utf8")) as { version: string }).version;

/** Unauthenticated on purpose - a version number isn't sensitive, and the update-check UI (Settings) needs it before/without necessarily depending on auth state. */
export async function registerSystemRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/version", async () => ({ version }));
}
