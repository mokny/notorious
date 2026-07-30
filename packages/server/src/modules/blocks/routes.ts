import type { FastifyInstance } from "fastify";
import { createBlockSchema, updateBlockSchema, moveBlockSchema, importMarkdownSchema } from "@notorious/shared";
import { requireUser, getClientId } from "../../plugins/session.js";
import { requireWorkspaceRole, requireAccess } from "../workspaces/access.js";
import { getObjectWorkspaceId, getObject } from "../objects/service.js";
import { recordAndBroadcast } from "../realtime/activity.js";
import * as blockService from "./service.js";
import { markdownToBlockTree, blocksToMarkdown } from "./markdown.js";

export async function registerBlockRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/objects/:objectId/blocks", async (request) => {
    const { objectId } = request.params as { objectId: string };
    const workspaceId = await getObjectWorkspaceId(objectId);
    await requireAccess(request, workspaceId, "viewer", { objectId });
    return blockService.listBlocks(objectId);
  });

  app.post("/api/v1/blocks", async (request, reply) => {
    const input = createBlockSchema.parse(request.body);
    const workspaceId = await getObjectWorkspaceId(input.objectId);
    const { actorId, actorName } = await requireAccess(request, workspaceId, "editor", { objectId: input.objectId });
    const block = await blockService.createBlock(input);

    if (actorId) {
      await recordAndBroadcast({
        workspaceId,
        objectId: input.objectId,
        actorId,
        clientId: getClientId(request),
        action: "updated",
        summary: `${actorName} added a block`,
        entity: "block",
        entityId: block.id,
        realtimeAction: "created",
      });
    }

    reply.code(201);
    return block;
  });

  app.patch("/api/v1/blocks/:id", async (request) => {
    const { id } = request.params as { id: string };
    const objectId = await blockService.getBlockObjectId(id);
    const workspaceId = await getObjectWorkspaceId(objectId);
    const { actorId, actorName } = await requireAccess(request, workspaceId, "editor", { objectId });
    const input = updateBlockSchema.parse(request.body);
    const block = await blockService.updateBlock(id, input);

    if (actorId) {
      await recordAndBroadcast({
        workspaceId,
        objectId,
        actorId,
        clientId: getClientId(request),
        action: "updated",
        summary: `${actorName} edited a block`,
        entity: "block",
        entityId: id,
        realtimeAction: "updated",
      });
    }

    return block;
  });

  app.post("/api/v1/blocks/:id/move", async (request) => {
    const { id } = request.params as { id: string };
    const objectId = await blockService.getBlockObjectId(id);
    const workspaceId = await getObjectWorkspaceId(objectId);
    const { actorId, actorName } = await requireAccess(request, workspaceId, "editor", { objectId });
    const input = moveBlockSchema.parse(request.body);
    const block = await blockService.moveBlock(id, input);

    if (actorId) {
      await recordAndBroadcast({
        workspaceId,
        objectId,
        actorId,
        clientId: getClientId(request),
        action: "updated",
        summary: `${actorName} reordered a block`,
        entity: "block",
        entityId: id,
        realtimeAction: "updated",
      });
    }

    return block;
  });

  app.delete("/api/v1/blocks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const objectId = await blockService.getBlockObjectId(id);
    const workspaceId = await getObjectWorkspaceId(objectId);
    const { actorId, actorName } = await requireAccess(request, workspaceId, "editor", { objectId });
    await blockService.deleteBlock(id);

    if (actorId) {
      await recordAndBroadcast({
        workspaceId,
        objectId,
        actorId,
        clientId: getClientId(request),
        action: "updated",
        summary: `${actorName} removed a block`,
        entity: "block",
        entityId: id,
        realtimeAction: "deleted",
      });
    }

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
