import fs from "node:fs";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import { adminCreateUserSchema, adminCallsSetupSchema, adminTriggerUpdateSchema } from "@notorious/shared";
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
  updateNeedsSudoPassword,
  verifySudoPassword,
  runUpdateScript,
  restartWithSudoPassword,
  restartServerProcess,
  listUpdateHistory,
  recordUpdateRun,
  listAdminNotifications,
  countUnreadAdminNotifications,
  markAdminNotificationRead,
  markAllAdminNotificationsRead,
} from "./service.js";
import { setCallsEnabled } from "../instanceSettings/service.js";
import { broadcastSystemStatus, sendToSession } from "../realtime/hub.js";
import { listAllSessions, adminRevokeSession, revokeAllSessions } from "../../plugins/session.js";
import { listFailedLogins, getUserById } from "../auth/service.js";
import { detectPublicIp } from "../../lib/publicIp.js";
import { upsertEnvVars } from "../../lib/envFile.js";
import { repoRoot } from "../../env.js";
import { nowIso } from "../../lib/ids.js";
import { badRequest, unauthorized, notFound } from "../../lib/httpError.js";

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

  // ---- Sessions (see plugins/session.ts's admin-facing helpers) ----

  app.get("/api/v1/admin/sessions", async (request) => {
    await requireInstanceAdmin(request);
    return listAllSessions(request);
  });

  app.delete("/api/v1/admin/sessions/:id", async (request, reply) => {
    const admin = await requireInstanceAdmin(request);
    const { id } = request.params as { id: string };
    const { wasCurrent } = await adminRevokeSession(request, id);
    sendToSession(id, { type: "sessionRevoked" });
    await logAdminAction(admin, "session.revoke", `Terminated session ${id}${wasCurrent ? " (own session)" : ""}`);
    reply.code(204);
  });

  app.delete("/api/v1/admin/users/:id/sessions", async (request, reply) => {
    const admin = await requireInstanceAdmin(request);
    const { id } = request.params as { id: string };
    const target = await getUserById(id);
    if (!target) throw notFound("User not found");
    const revokedIds = await revokeAllSessions(id);
    for (const sessionId of revokedIds) sendToSession(sessionId, { type: "sessionRevoked" });
    await logAdminAction(admin, "session.revokeAll", `Logged out ${target.email} from all devices (${revokedIds.length} session(s))`);
    reply.code(204);
  });

  // ---- Failed logins ----

  app.get("/api/v1/admin/failed-logins", async (request) => {
    await requireInstanceAdmin(request);
    const { filter } = request.query as { filter?: string };
    return listFailedLogins(filter === "unknown" ? "unknown" : "known");
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

  // Lets the frontend decide whether to show a sudo-password field before
  // the user even clicks "Update now" - see AdminUpdateTab.tsx.
  app.get("/api/v1/admin/update/sudo-required", async (request) => {
    await requireInstanceAdmin(request);
    return { required: await updateNeedsSudoPassword() };
  });

  app.get("/api/v1/admin/update/history", async (request) => {
    await requireInstanceAdmin(request);
    const { limit } = request.query as { limit?: string };
    const parsedLimit = limit ? Number(limit) : 10;
    return listUpdateHistory(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 10);
  });

  /**
   * Streams `scripts/update.sh`'s output live as it runs (SSE-shaped, but
   * read via `fetch` + a streaming reader on the frontend rather than
   * `EventSource`, since browsers only let `EventSource` issue GET requests
   * - see AdminUpdateTab.tsx). When running as a non-root user with no
   * passwordless sudo configured, a `sudoPassword` is required and is
   * validated here - BEFORE `runUpdateScript` is ever called - so a wrong
   * password fails fast instead of after several minutes of downloading and
   * rebuilding. The update script restarts the systemd service (and
   * therefore this very Node process) partway through, which simply ends the
   * stream from the client's point of view; the frontend falls back to
   * polling `/api/v1/version` once the connection drops.
   */
  app.post("/api/v1/admin/update", async (request, reply) => {
    const admin = await requireInstanceAdmin(request);
    const input = adminTriggerUpdateSchema.parse(request.body ?? {});

    const needsSudo = await updateNeedsSudoPassword();
    if (needsSudo) {
      if (!input.sudoPassword) throw badRequest("A sudo password is required to restart the service on this server");
      if (!(await verifySudoPassword(input.sudoPassword))) throw unauthorized("Incorrect sudo password");
    }

    await logAdminAction(admin, "update.trigger", `Triggered a server update (${input.channel})`);
    // See SystemUpdateStatusMessage's doc comment: every open tab/device
    // app-wide (not just this admin's) needs to know an update is running
    // before the service restart severs their sockets.
    broadcastSystemStatus({ type: "systemUpdate", status: "inProgress", reason: "update", version: PACKAGE_VERSION });

    const startedAt = nowIso();

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    const child = runUpdateScript(needsSudo, input.channel, "manual", startedAt);
    const send = (line: string) => reply.raw.write(`data: ${JSON.stringify(line)}\n\n`);

    child.stdout?.on("data", (chunk: Buffer) => send(chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => send(chunk.toString()));
    child.on("error", (error) => {
      send(`Error: ${error.message}`);
      broadcastSystemStatus({ type: "systemUpdate", status: "failed", reason: "update", version: PACKAGE_VERSION });
      recordUpdateRun({
        startedAt,
        finishedAt: nowIso(),
        trigger: "manual",
        channel: input.channel,
        fromVersion: PACKAGE_VERSION,
        toVersion: null,
        status: "failure",
        errorMessage: error.message,
      }).catch((e: unknown) => console.error("[admin] Failed to record update run:", e));
      reply.raw.end();
    });
    child.on("close", (code) => {
      const success = code === 0;
      // Only the failure case is recorded here - a successful run already
      // wrote its own `update_runs` row (and, if this were an auto-update,
      // its admin notifications) from inside update.sh via
      // `record-update-outcome`, right before the restart that's about to
      // sever this very connection - see runUpdateScript's doc comment.
      if (!success) {
        recordUpdateRun({
          startedAt,
          finishedAt: nowIso(),
          trigger: "manual",
          channel: input.channel,
          fromVersion: PACKAGE_VERSION,
          toVersion: null,
          status: "failure",
          errorMessage: `update.sh exited with code ${code}`,
        }).catch((e: unknown) => console.error("[admin] Failed to record update run:", e));
      }
      if (needsSudo && input.sudoPassword) {
        send("Restarting the service…");
        restartWithSudoPassword(input.sudoPassword);
      } else if (code !== 0) {
        // A non-zero exit with no sudo restart pending means update.sh
        // itself failed (or, without a systemd unit, never restarted at
        // all) - the process that would otherwise flip this back to "idle"
        // by simply booting fresh is never coming, so tell every banner
        // explicitly rather than leaving them stuck on "inProgress" forever.
        broadcastSystemStatus({ type: "systemUpdate", status: "failed", reason: "update", version: PACKAGE_VERSION });
      }
      send(`Update script exited with code ${code}.`);
      reply.raw.write(`event: done\ndata: {}\n\n`);
      reply.raw.end();
    });
    child.unref();
  });

  // ---- Admin notification bell (see modules/admin/service.ts's `notifyAllAdmins`) ----

  app.get("/api/v1/admin/notifications", async (request) => {
    const admin = await requireInstanceAdmin(request);
    return listAdminNotifications(admin.id);
  });

  app.get("/api/v1/admin/notifications/unread-count", async (request) => {
    const admin = await requireInstanceAdmin(request);
    return { count: await countUnreadAdminNotifications(admin.id) };
  });

  app.post("/api/v1/admin/notifications/:id/read", async (request, reply) => {
    const admin = await requireInstanceAdmin(request);
    const { id } = request.params as { id: string };
    await markAdminNotificationRead(id, admin.id);
    reply.code(204);
  });

  app.post("/api/v1/admin/notifications/read-all", async (request, reply) => {
    const admin = await requireInstanceAdmin(request);
    await markAllAdminNotificationsRead(admin.id);
    reply.code(204);
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

    broadcastSystemStatus({ type: "systemUpdate", status: "inProgress", reason: "restart", version: PACKAGE_VERSION });
    restartServerProcess().unref();
    return { restarting: true };
  });

  app.post("/api/v1/admin/restart", async (request) => {
    const admin = await requireInstanceAdmin(request);
    await logAdminAction(admin, "server.restart", "Manually restarted the server process");
    broadcastSystemStatus({ type: "systemUpdate", status: "inProgress", reason: "restart", version: PACKAGE_VERSION });
    restartServerProcess().unref();
    return { restarting: true };
  });
}
