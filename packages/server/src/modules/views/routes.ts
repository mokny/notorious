import type { FastifyInstance } from "fastify";
import { createViewSchema, updateViewSchema } from "@notorious/shared";
import { requireUser } from "../../plugins/session.js";
import { requireWorkspaceRole, requireWorkspaceScopedAccess } from "../workspaces/access.js";
import { queryObjects } from "../objects/service.js";
import * as viewService from "./service.js";

export async function registerViewRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/workspaces/:workspaceId/views", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceScopedAccess(request, workspaceId, "viewer");
    const { objectTypeId } = request.query as { objectTypeId?: string };
    return viewService.listViews(workspaceId, objectTypeId);
  });

  app.post("/api/v1/workspaces/:workspaceId/views", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    const input = createViewSchema.parse(request.body);
    reply.code(201);
    return viewService.createView(workspaceId, user.id, input);
  });

  app.patch("/api/v1/views/:id", async (request) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const view = await viewService.getView(id);
    await requireWorkspaceRole(view.workspaceId, user.id, "editor");
    const input = updateViewSchema.parse(request.body);
    return viewService.updateView(id, input);
  });

  app.delete("/api/v1/views/:id", async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const view = await viewService.getView(id);
    await requireWorkspaceRole(view.workspaceId, user.id, "editor");
    await viewService.deleteView(id);
    reply.code(204);
  });

  /** Runs a saved view's filter/sort configuration against live object data. */
  app.get("/api/v1/views/:id/results", async (request) => {
    const { id } = request.params as { id: string };
    const view = await viewService.getView(id);
    await requireWorkspaceScopedAccess(request, view.workspaceId, "viewer");
    const { cursor, limit } = request.query as { cursor?: string; limit?: string };

    return queryObjects(view.workspaceId, {
      objectTypeId: view.objectTypeId ?? undefined,
      archived: false,
      filters: view.config.filters,
      sorts: view.config.sorts,
      cursor,
      limit: limit ? Number(limit) : 100,
    });
  });
}
