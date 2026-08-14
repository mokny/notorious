import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { adminCreateUserSchema, adminCallsSetupSchema } from "@notorious/shared";
import { requireInstanceAdmin } from "./access.js";
import {
  listUsers,
  createUserByAdmin,
  setServerAdmin,
  previewUserDeletion,
  deleteUserAccount,
  listAuditLog,
  logAdminAction,
  checkForUpdate,
  runUpdateScript,
  restartServerProcess,
} from "./service.js";
import { setCallsEnabled } from "../instanceSettings/service.js";
import { detectPublicIp } from "../../lib/publicIp.js";
import { upsertEnvVars } from "../../lib/envFile.js";
import { repoRoot } from "../../env.js";

const PACKAGE_VERSION = (JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")) as { version: string }).version;

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  // ---- Users ----

  app.get("/api/v1/admin/users", async (request) => {
    await requireInstanceAdmin(request);
    return listUsers();
  });

  app.post("/api/v1/admin/users", async (request, reply) => {
    const admin = await requireInstanceAdmin(request);
    const input = adminCreateUserSchema.parse(request.body);
    const result = await createUserByAdmin(input);
    await logAdminAction(admin, "user.create", `Created user ${result.user.email}`);
    reply.code(201);
    return result;
  });

  app.post("/api/v1/admin/users/:id/promote", async (request) => {
    const admin = await requireInstanceAdmin(request);
    const { id } = request.params as { id: string };
    const user = await setServerAdmin(id, true);
    await logAdminAction(admin, "user.promote", `Granted server-admin to ${user.email}`);
    return user;
  });

  app.post("/api/v1/admin/users/:id/demote", async (request) => {
    const admin = await requireInstanceAdmin(request);
    const { id } = request.params as { id: string };
    const user = await setServerAdmin(id, false);
    await logAdminAction(admin, "user.demote", `Revoked server-admin from ${user.email}`);
    return user;
  });

  app.get("/api/v1/admin/users/:id/delete-preview", async (request) => {
    await requireInstanceAdmin(request);
    const { id } = request.params as { id: string };
    return previewUserDeletion(id);
  });

  app.delete("/api/v1/admin/users/:id", async (request, reply) => {
    const admin = await requireInstanceAdmin(request);
    const { id } = request.params as { id: string };
    const preview = await previewUserDeletion(id);
    await deleteUserAccount(id);
    await logAdminAction(admin, "user.delete", `Deleted user ${preview.user.email}`);
    reply.code(204);
  });

  // ---- Audit log ----

  app.get("/api/v1/admin/audit-log", async (request) => {
    await requireInstanceAdmin(request);
    return listAuditLog();
  });

  // ---- Version / update ----

  app.get("/api/v1/admin/version-check", async (request) => {
    await requireInstanceAdmin(request);
    return checkForUpdate(PACKAGE_VERSION);
  });

  /**
   * Streams `scripts/update.sh`'s output live as it runs (SSE-shaped, but
   * read via `fetch` + a streaming reader on the frontend rather than
   * `EventSource`, since browsers only let `EventSource` issue GET requests
   * - see AdminUpdatePanel.tsx). The update script restarts the systemd
   * service (and therefore this very Node process) partway through, which
   * simply ends the stream from the client's point of view; the frontend
   * falls back to polling `/api/v1/version` once the connection drops.
   */
  app.post("/api/v1/admin/update", async (request, reply) => {
    const admin = await requireInstanceAdmin(request);
    await logAdminAction(admin, "update.trigger", "Triggered a server update");

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const child = runUpdateScript();
    const send = (line: string) => reply.raw.write(`data: ${JSON.stringify(line)}\n\n`);

    child.stdout?.on("data", (chunk: Buffer) => send(chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => send(chunk.toString()));
    child.on("error", (error) => {
      send(`Error: ${error.message}`);
      reply.raw.end();
    });
    child.on("close", (code) => {
      send(`Update script exited with code ${code}.`);
      reply.raw.write(`event: done\ndata: {}\n\n`);
      reply.raw.end();
    });
    child.unref();
  });

  // ---- Calls setup wizard ----

  app.get("/api/v1/admin/detect-public-ip", async (request) => {
    await requireInstanceAdmin(request);
    return { ip: await detectPublicIp() };
  });

  /**
   * The UI equivalent of `scripts/setup-calls`: writes MEDIA_ANNOUNCED_IP/
   * MEDIA_PORT to `.env`, enables calls, and restarts the server process so
   * the new env vars actually take effect (they're only read at startup) -
   * see modules/admin/service.ts's `restartServerProcess`.
   */
  app.post("/api/v1/admin/calls-setup", async (request) => {
    const admin = await requireInstanceAdmin(request);
    const input = adminCallsSetupSchema.parse(request.body);

    upsertEnvVars({ MEDIA_ANNOUNCED_IP: input.mediaAnnouncedIp, MEDIA_PORT: String(input.mediaPort) });
    await setCallsEnabled(true);
    await logAdminAction(admin, "calls.setup", `Configured calls (${input.mediaAnnouncedIp}:${input.mediaPort}) and restarted the server`);

    restartServerProcess().unref();
    return { restarting: true };
  });

  app.post("/api/v1/admin/restart", async (request) => {
    const admin = await requireInstanceAdmin(request);
    await logAdminAction(admin, "server.restart", "Manually restarted the server process");
    restartServerProcess().unref();
    return { restarting: true };
  });
}
