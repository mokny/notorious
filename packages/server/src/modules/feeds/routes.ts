import type { FastifyInstance } from "fastify";
import { discoverFeedSchema, createFeedSourceSchema, updateFeedSourceSchema } from "@notorious/shared";
import { badRequest } from "../../lib/httpError.js";
import { requireAccess } from "../workspaces/access.js";
import { getObjectWorkspaceId } from "../objects/service.js";
import { getBlockObjectId } from "../blocks/service.js";
import * as feedService from "./service.js";

async function workspaceIdForBlock(blockId: string): Promise<{ objectId: string; workspaceId: string }> {
  const objectId = await getBlockObjectId(blockId);
  const workspaceId = await getObjectWorkspaceId(objectId);
  return { objectId, workspaceId };
}

export async function registerFeedRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/blocks/:blockId/feed-sources/discover", async (request) => {
    const { blockId } = request.params as { blockId: string };
    const { objectId, workspaceId } = await workspaceIdForBlock(blockId);
    await requireAccess(request, workspaceId, "editor", { objectId });
    const input = discoverFeedSchema.parse(request.body);
    return feedService.discoverFeeds(input.url);
  });

  app.get("/api/v1/blocks/:blockId/feed-sources", async (request) => {
    const { blockId } = request.params as { blockId: string };
    const { objectId, workspaceId } = await workspaceIdForBlock(blockId);
    await requireAccess(request, workspaceId, "viewer", { objectId });
    return feedService.listFeedSources(blockId);
  });

  app.post("/api/v1/blocks/:blockId/feed-sources", async (request, reply) => {
    const { blockId } = request.params as { blockId: string };
    const { objectId, workspaceId } = await workspaceIdForBlock(blockId);
    await requireAccess(request, workspaceId, "editor", { objectId });
    const input = createFeedSourceSchema.parse(request.body);
    const source = await feedService.createFeedSource(blockId, input);
    reply.code(201);
    return source;
  });

  app.get("/api/v1/blocks/:blockId/feed-items", async (request) => {
    const { blockId } = request.params as { blockId: string };
    const { objectId, workspaceId } = await workspaceIdForBlock(blockId);
    await requireAccess(request, workspaceId, "viewer", { objectId });
    const { limit } = request.query as { limit?: string };
    const parsedLimit = limit ? Number(limit) : 10;
    if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) throw badRequest("limit must be a positive number");
    return feedService.listFeedItemsForBlock(blockId, parsedLimit);
  });

  app.patch("/api/v1/feed-sources/:id", async (request) => {
    const { id } = request.params as { id: string };
    const blockId = await feedService.getFeedSourceBlockId(id);
    const { objectId, workspaceId } = await workspaceIdForBlock(blockId);
    await requireAccess(request, workspaceId, "editor", { objectId });
    const input = updateFeedSourceSchema.parse(request.body);
    return feedService.updateFeedSource(id, input);
  });

  app.delete("/api/v1/feed-sources/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const blockId = await feedService.getFeedSourceBlockId(id);
    const { objectId, workspaceId } = await workspaceIdForBlock(blockId);
    await requireAccess(request, workspaceId, "editor", { objectId });
    await feedService.deleteFeedSource(id);
    reply.code(204);
  });

  app.post("/api/v1/feed-sources/:id/refresh", async (request) => {
    const { id } = request.params as { id: string };
    const blockId = await feedService.getFeedSourceBlockId(id);
    const { objectId, workspaceId } = await workspaceIdForBlock(blockId);
    // Refreshing pulls newer external data, it doesn't edit the object's own
    // content - same reasoning as the checklist checkbox exemption, so it
    // stays available even when the object is locked (see access.ts).
    await requireAccess(request, workspaceId, "editor", { objectId, allowWhenLocked: true });
    return feedService.refreshFeedSource(id);
  });
}
