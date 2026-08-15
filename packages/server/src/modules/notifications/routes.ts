import type { FastifyInstance } from "fastify";
import { requireUser } from "../../plugins/session.js";
import { requireWorkspaceRole } from "../workspaces/access.js";
import * as notificationService from "./service.js";

/** Members-only, full stop - a share-link visitor has no account, so nothing here applies to them (see notificationService's own doc comment). */
export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/workspaces/:workspaceId/notifications", async (request) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "viewer");
    return notificationService.listNotifications(user.id, workspaceId);
  });

  app.get("/api/v1/workspaces/:workspaceId/notifications/unread-count", async (request) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "viewer");
    return { count: await notificationService.countUnreadNotifications(user.id, workspaceId) };
  });

  app.post("/api/v1/workspaces/:workspaceId/notifications/:id/read", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await requireWorkspaceRole(workspaceId, user.id, "viewer");
    await notificationService.markNotificationRead(id, user.id);
    reply.code(204);
  });

  app.post("/api/v1/workspaces/:workspaceId/notifications/read-all", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "viewer");
    await notificationService.markAllNotificationsRead(user.id, workspaceId);
    reply.code(204);
  });
}
