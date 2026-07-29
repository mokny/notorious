import type { FastifyInstance } from "fastify";
import { createBlockSchema, updateBlockSchema, moveBlockSchema, importMarkdownSchema } from "@notorious/shared";
import { requireUser, getClientId } from "../../plugins/session.js";
import { requireWorkspaceRole } from "../workspaces/access.js";
import { getObjectWorkspaceId, getObject } from "../objects/service.js";
import { recordAndBroadcast } from "../realtime/activity.js";
import * as blockService from "./service.js";
import { markdownToBlockTree, blocksToMarkdown } from "./markdown.js";

export async function registerBlockRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/objects/:objectId/blocks", async (request) => {
    const user = requireUser(request);
    const { objectId } = request.params as { objectId: string };
    const workspaceId = await getObjectWorkspaceId(objectId);
    await requireWorkspaceRole(workspaceId, user.id, "viewer");
    return blockService.listBlocks(objectId);
  });

  app.post("/api/v1/blocks", async (request, reply) => {
    const user = requireUser(request);
    const input = createBlockSchema.parse(request.body);
    const workspaceId = await getObjectWorkspaceId(input.objectId);
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    const block = await blockService.createBlock(input);

    await recordAndBroadcast({
      workspaceId,
      objectId: input.objectId,
      actorId: user.id,
      clientId: getClientId(request),
      action: "updated",
      summary: `${user.name} added a block`,
      entity: "block",
      entityId: block.id,
      realtimeAction: "created",
    });

    reply.code(201);
    return block;
  });

  app.patch("/api/v1/blocks/:id", async (request) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const objectId = await blockService.getBlockObjectId(id);
    const workspaceId = await getObjectWorkspaceId(objectId);
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    const input = updateBlockSchema.parse(request.body);
    const block = await blockService.updateBlock(id, input);

    await recordAndBroadcast({
      workspaceId,
      objectId,
      actorId: user.id,
      clientId: getClientId(request),
      action: "updated",
      summary: `${user.name} edited a block`,
      entity: "block",
      entityId: id,
      realtimeAction: "updated",
    });

    return block;
  });

  app.post("/api/v1/blocks/:id/move", async (request) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const objectId = await blockService.getBlockObjectId(id);
    const workspaceId = await getObjectWorkspaceId(objectId);
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    const input = moveBlockSchema.parse(request.body);
    const block = await blockService.moveBlock(id, input);

    await recordAndBroadcast({
      workspaceId,
      objectId,
      actorId: user.id,
      clientId: getClientId(request),
      action: "updated",
      summary: `${user.name} reordered a block`,
      entity: "block",
      entityId: id,
      realtimeAction: "updated",
    });

    return block;
  });

  app.delete("/api/v1/blocks/:id", async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const objectId = await blockService.getBlockObjectId(id);
    const workspaceId = await getObjectWorkspaceId(objectId);
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    await blockService.deleteBlock(id);

    await recordAndBroadcast({
      workspaceId,
      objectId,
      actorId: user.id,
      clientId: getClientId(request),
      action: "updated",
      summary: `${user.name} removed a block`,
      entity: "block",
      entityId: id,
      realtimeAction: "deleted",
    });

    reply.code(204);
  });

  app.post("/api/v1/blocks/import-markdown", async (request) => {
    const user = requireUser(request);
    const input = importMarkdownSchema.parse(request.body);
    const workspaceId = await getObjectWorkspaceId(input.objectId);
    await requireWorkspaceRole(workspaceId, user.id, "editor");

    const tree = markdownToBlockTree(input.markdown);
    await blockService.replaceAllBlocks(input.objectId, tree);

    await recordAndBroadcast({
      workspaceId,
      objectId: input.objectId,
      actorId: user.id,
      clientId: getClientId(request),
      action: "updated",
      summary: `${user.name} imported Markdown content`,
      entity: "block",
      entityId: input.objectId,
      realtimeAction: "updated",
    });

    return blockService.listBlocks(input.objectId);
  });

  app.get("/api/v1/objects/:objectId/export-markdown", async (request, reply) => {
    const user = requireUser(request);
    const { objectId } = request.params as { objectId: string };
    const workspaceId = await getObjectWorkspaceId(objectId);
    await requireWorkspaceRole(workspaceId, user.id, "viewer");

    const [object, blocks] = await Promise.all([getObject(objectId), blockService.listBlocks(objectId)]);
    const markdown = `# ${object.title}\n\n${blocksToMarkdown(blocks)}`;

    reply.header("Content-Type", "text/markdown; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${object.title.replace(/[^\w-]+/g, "_")}.md"`);
    return markdown;
  });
}
