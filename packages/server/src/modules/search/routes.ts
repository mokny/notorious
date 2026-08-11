import type { FastifyInstance } from "fastify";
import { searchQuerySchema, createSavedSearchSchema } from "@notorious/shared";
import { requireUser } from "../../plugins/session.js";
import { requireWorkspaceRole, requireWorkspaceScopedAccess } from "../workspaces/access.js";
import { isSudoActive } from "../reverify/service.js";
import * as searchService from "./service.js";

export async function registerSearchRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/workspaces/:workspaceId/search", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceScopedAccess(request, workspaceId, "viewer");
    const query = searchQuerySchema.parse(request.query);
    const hasSudo = await isSudoActive(request);
    return searchService.searchObjects(workspaceId, query, hasSudo);
  });

  app.get("/api/v1/workspaces/:workspaceId/saved-searches", async (request) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "viewer");
    return searchService.listSavedSearches(workspaceId, user.id);
  });

  app.post("/api/v1/workspaces/:workspaceId/saved-searches", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "viewer");
    const input = createSavedSearchSchema.parse(request.body);
    reply.code(201);
    return searchService.createSavedSearch(workspaceId, user.id, input);
  });

  app.delete("/api/v1/saved-searches/:id", async (request, reply) => {
    requireUser(request);
    const { id } = request.params as { id: string };
    await searchService.deleteSavedSearch(id);
    reply.code(204);
  });
}
