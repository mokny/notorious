import type { FastifyInstance } from "fastify";
import {
  createBlockSchema,
  updateBlockSchema,
  moveBlockSchema,
  importMarkdownSchema,
  restoreBlockSchema,
  toggleChecklistItemSchema,
  toggleWhiteboardPresentingSchema,
  castVoteSchema,
  updateVotingSettingsSchema,
} from "@notorious/shared";
import { badRequest } from "../../lib/httpError.js";
import { requireUser, getClientId } from "../../plugins/session.js";
import { requireWorkspaceRole, requireAccess, resolveActor } from "../workspaces/access.js";
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

  app.get("/api/v1/blocks/:id/history", async (request) => {
    const { id } = request.params as { id: string };
    const objectId = await blockService.getBlockObjectId(id);
    const workspaceId = await getObjectWorkspaceId(objectId);
    await requireAccess(request, workspaceId, "viewer", { objectId });
    return blockService.listBlockHistory(id);
  });

  app.post("/api/v1/blocks", async (request, reply) => {
    const input = createBlockSchema.parse(request.body);
    const workspaceId = await getObjectWorkspaceId(input.objectId);
    const access = await requireAccess(request, workspaceId, "editor", { objectId: input.objectId });
    const block = await blockService.createBlock(input);

    const created = resolveActor(request, access);
    await recordAndBroadcast({
      workspaceId,
      objectId: input.objectId,
      actorId: created.actorId,
      actorName: created.actorName,
      clientId: getClientId(request),
      action: "updated",
      summary: `${created.actorName} added a block`,
      entity: "block",
      entityId: block.id,
      realtimeAction: "created",
    });

    reply.code(201);
    return block;
  });

  // Editor undo/redo only (see useEditorHistory.ts) - re-inserts a block with
  // its original id/position instead of computing a fresh one, so a restored
  // block reappears exactly where it was, not wherever `afterBlockId` would
  // place a brand-new block relative to today's neighbors.
  app.post("/api/v1/blocks/restore", async (request, reply) => {
    const input = restoreBlockSchema.parse(request.body);
    const workspaceId = await getObjectWorkspaceId(input.objectId);
    const access = await requireAccess(request, workspaceId, "editor", { objectId: input.objectId });
    const block = await blockService.restoreBlock(input);

    const restored = resolveActor(request, access);
    await recordAndBroadcast({
      workspaceId,
      objectId: input.objectId,
      actorId: restored.actorId,
      actorName: restored.actorName,
      clientId: getClientId(request),
      action: "updated",
      summary: `${restored.actorName} restored a block`,
      entity: "block",
      entityId: block.id,
      realtimeAction: "created",
    });

    reply.code(201);
    return block;
  });

  app.patch("/api/v1/blocks/:id", async (request) => {
    const { id } = request.params as { id: string };
    const objectId = await blockService.getBlockObjectId(id);
    const workspaceId = await getObjectWorkspaceId(objectId);
    const access = await requireAccess(request, workspaceId, "editor", { objectId });
    const input = updateBlockSchema.parse(request.body);
    const block = await blockService.updateBlock(id, input);

    const updated = resolveActor(request, access);
    await recordAndBroadcast({
      workspaceId,
      objectId,
      actorId: updated.actorId,
      actorName: updated.actorName,
      clientId: getClientId(request),
      action: "updated",
      summary: `${updated.actorName} edited a block`,
      entity: "block",
      entityId: id,
      realtimeAction: "updated",
    });

    return block;
  });

  // Checking an item off a to-do list is exempt from the object-lock -
  // see toggleChecklistItemSchema's doc comment and access.ts's
  // `allowWhenLocked`. Kept as its own narrow endpoint rather than folding
  // into the generic PATCH above, so that exemption can never accidentally
  // cover any other kind of edit to the block.
  app.patch("/api/v1/blocks/:id/checklist-item", async (request) => {
    const { id } = request.params as { id: string };
    const objectId = await blockService.getBlockObjectId(id);
    const workspaceId = await getObjectWorkspaceId(objectId);
    const access = await requireAccess(request, workspaceId, "editor", { objectId, allowWhenLocked: true });
    const input = toggleChecklistItemSchema.parse(request.body);
    const block = await blockService.toggleChecklistItem(id, input.itemId, input.checked);

    const actor = resolveActor(request, access);
    await recordAndBroadcast({
      workspaceId,
      objectId,
      actorId: actor.actorId,
      actorName: actor.actorName,
      clientId: getClientId(request),
      action: "updated",
      summary: `${actor.actorName} ${input.checked ? "checked off" : "unchecked"} a checklist item`,
      entity: "block",
      entityId: id,
      realtimeAction: "updated",
    });

    return block;
  });

  // Starting/stopping a presentation is exempt from the object-lock, but
  // only for the workspace owner - see toggleWhiteboardPresentingSchema's
  // doc comment. `minRole: "owner"` (not "editor") is what enforces that;
  // everything else about this route mirrors the checklist-item exemption
  // above.
  app.patch("/api/v1/blocks/:id/whiteboard-presenting", async (request) => {
    const { id } = request.params as { id: string };
    const objectId = await blockService.getBlockObjectId(id);
    const workspaceId = await getObjectWorkspaceId(objectId);
    const access = await requireAccess(request, workspaceId, "owner", { objectId, allowWhenLocked: true });
    const input = toggleWhiteboardPresentingSchema.parse(request.body);
    const block = await blockService.toggleWhiteboardPresenting(id, input.presenting);

    const actor = resolveActor(request, access);
    await recordAndBroadcast({
      workspaceId,
      objectId,
      actorId: actor.actorId,
      actorName: actor.actorName,
      clientId: getClientId(request),
      action: "updated",
      summary: `${actor.actorName} ${input.presenting ? "started" : "stopped"} presenting a whiteboard`,
      entity: "block",
      entityId: id,
      realtimeAction: "updated",
    });

    return block;
  });

  // Aggregated per-item vote counts plus (if identifiable) the caller's own
  // vote - `viewer` minRole so any reader, including an anonymous share-link
  // visitor, can see results. `voterKey` comes from the query string for
  // anonymous callers (the client's persisted visitor id - see web's
  // lib/visitorIdentity.ts); logged-in callers are identified by
  // `request.user.id` instead, ignoring any `voterKey` they might send.
  app.get("/api/v1/blocks/:id/votes", async (request) => {
    const { id } = request.params as { id: string };
    const { voterKey } = request.query as { voterKey?: string };
    const objectId = await blockService.getBlockObjectId(id);
    const workspaceId = await getObjectWorkspaceId(objectId);
    await requireAccess(request, workspaceId, "viewer", { objectId });
    const key = request.user?.id ?? voterKey ?? null;
    return blockService.getVoteSummary(id, key);
  });

  // Casting/changing/retracting a vote is exempt from the object-lock and
  // open to any viewer (including anonymous share-link visitors) - see
  // castVoteSchema's doc comment. `minRole: "viewer"` is below the
  // "editor" threshold that triggers the lock check in `requireAccess`, so
  // this never needs `allowWhenLocked` to reach a locked object.
  app.patch("/api/v1/blocks/:id/vote", async (request) => {
    const { id } = request.params as { id: string };
    const objectId = await blockService.getBlockObjectId(id);
    const workspaceId = await getObjectWorkspaceId(objectId);
    const access = await requireAccess(request, workspaceId, "viewer", { objectId });
    const input = castVoteSchema.parse(request.body);
    const voterKey = request.user?.id ?? input.voterKey;
    if (!voterKey) throw badRequest("voterKey is required for anonymous voting");
    const summary = await blockService.castVote(id, voterKey, input);

    const actor = resolveActor(request, access);
    await recordAndBroadcast({
      workspaceId,
      objectId,
      actorId: actor.actorId,
      actorName: actor.actorName,
      clientId: getClientId(request),
      action: "updated",
      summary: `${actor.actorName} voted`,
      entity: "block",
      entityId: id,
      realtimeAction: "updated",
    });

    return summary;
  });

  // Voting settings (multi-vote allowance, deadline) are owner-only and
  // exempt from the object-lock, mirroring `whiteboard-presenting` above.
  app.patch("/api/v1/blocks/:id/voting-settings", async (request) => {
    const { id } = request.params as { id: string };
    const objectId = await blockService.getBlockObjectId(id);
    const workspaceId = await getObjectWorkspaceId(objectId);
    const access = await requireAccess(request, workspaceId, "owner", { objectId, allowWhenLocked: true });
    const input = updateVotingSettingsSchema.parse(request.body);
    const block = await blockService.updateVotingSettings(id, input);

    const actor = resolveActor(request, access);
    await recordAndBroadcast({
      workspaceId,
      objectId,
      actorId: actor.actorId,
      actorName: actor.actorName,
      clientId: getClientId(request),
      action: "updated",
      summary: `${actor.actorName} changed voting settings`,
      entity: "block",
      entityId: id,
      realtimeAction: "updated",
    });

    return block;
  });

  app.post("/api/v1/blocks/:id/move", async (request) => {
    const { id } = request.params as { id: string };
    const objectId = await blockService.getBlockObjectId(id);
    const workspaceId = await getObjectWorkspaceId(objectId);
    const access = await requireAccess(request, workspaceId, "editor", { objectId });
    const input = moveBlockSchema.parse(request.body);
    const block = await blockService.moveBlock(id, input);

    const moved = resolveActor(request, access);
    await recordAndBroadcast({
      workspaceId,
      objectId,
      actorId: moved.actorId,
      actorName: moved.actorName,
      clientId: getClientId(request),
      action: "updated",
      summary: `${moved.actorName} reordered a block`,
      entity: "block",
      entityId: id,
      realtimeAction: "updated",
    });

    return block;
  });

  app.delete("/api/v1/blocks/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const objectId = await blockService.getBlockObjectId(id);
    const workspaceId = await getObjectWorkspaceId(objectId);
    const access = await requireAccess(request, workspaceId, "editor", { objectId });
    await blockService.deleteBlock(id);

    const deleted = resolveActor(request, access);
    // Deliberately no `actorName` here (unlike every other block route) -
    // block_history.block_id is a foreign key to blocks.id, and the block
    // above is already gone by the time this runs, so there'd be nothing
    // for that row to reference. Matches the migration's own reasoning:
    // history for a block that no longer exists isn't reachable from the UI
    // anyway (you can only view history by clicking an existing block).
    await recordAndBroadcast({
      workspaceId,
      objectId,
      actorId: deleted.actorId,
      clientId: getClientId(request),
      action: "updated",
      summary: `${deleted.actorName} removed a block`,
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
    const { objectId } = request.params as { objectId: string };
    const workspaceId = await getObjectWorkspaceId(objectId);
    // Reached via `window.open(...)` (see BlockEditor.tsx) - a plain
    // navigation, same "no custom header" constraint as an <img src>, so the
    // share token (if any) arrives as a query param here too (see
    // plugins/session.ts).
    await requireAccess(request, workspaceId, "viewer", { objectId });

    const [object, blocks] = await Promise.all([getObject(objectId), blockService.listBlocks(objectId)]);
    const markdown = `# ${object.title}\n\n${blocksToMarkdown(blocks)}`;

    reply.header("Content-Type", "text/markdown; charset=utf-8");
    reply.header("Content-Disposition", `attachment; filename="${object.title.replace(/[^\w-]+/g, "_")}.md"`);
    return markdown;
  });
}
