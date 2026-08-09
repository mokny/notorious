import fs from "node:fs";
import type { FastifyInstance } from "fastify";
import { createChannelSchema, renameChannelSchema, createDmSchema, sendMessageSchema, reactSchema, markReadSchema } from "@notorious/shared";
import { requireUser } from "../../plugins/session.js";
import { requireWorkspaceRole } from "../workspaces/access.js";
import { requireConversationAccess, requireChannelManageAccess } from "./access.js";
import { absoluteStoragePath } from "../../lib/storage.js";
import { badRequest } from "../../lib/httpError.js";
import { searchMessages } from "../search/service.js";
import * as chatService from "./service.js";

const PREVIEWABLE_MIME_PREFIXES = ["image/", "video/", "audio/"];

export async function registerChatRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/chat/conversations", async (request) => {
    const user = requireUser(request);
    return chatService.listUnifiedConversations(user.id);
  });

  app.post("/api/v1/workspaces/:workspaceId/chat/channels", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "viewer");
    const input = createChannelSchema.parse(request.body);
    const conversation = await chatService.createChannel(workspaceId, user.id, input.name);
    reply.code(201);
    return conversation;
  });

  app.get("/api/v1/workspaces/:workspaceId/chat/channels", async (request) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "viewer");
    return chatService.listWorkspaceChannels(workspaceId, user.id);
  });

  app.post("/api/v1/workspaces/:workspaceId/chat/channels/:id/join", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await requireWorkspaceRole(workspaceId, user.id, "viewer");
    await chatService.joinChannel(id, user.id);
    reply.code(204);
  });

  app.post("/api/v1/chat/dms", async (request, reply) => {
    const user = requireUser(request);
    const input = createDmSchema.parse(request.body);
    const conversation = await chatService.findOrCreateDm(user.id, input.emails);
    reply.code(201);
    return conversation;
  });

  app.patch("/api/v1/chat/conversations/:id", async (request) => {
    const { id } = request.params as { id: string };
    await requireChannelManageAccess(request, id);
    const input = renameChannelSchema.parse(request.body);
    await chatService.renameChannel(id, input.name);
    return { id, name: input.name };
  });

  // Delete (channel creator/workspace owner) or leave (any participant) -
  // the access check picks which is which: channel-manage access implies
  // delete, otherwise it's just this caller leaving.
  app.delete("/api/v1/chat/conversations/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const access = await requireConversationAccess(request, id);
    const isManageRequest = (request.query as { manage?: string })?.manage === "true";

    if (isManageRequest && access.conversation.type === "workspace_channel") {
      await requireChannelManageAccess(request, id);
      await chatService.deleteChannel(id);
    } else {
      await chatService.leaveConversation(id, access.userId);
    }
    reply.code(204);
  });

  app.get("/api/v1/chat/conversations/:id/messages", async (request) => {
    const { id } = request.params as { id: string };
    await requireConversationAccess(request, id);
    const { before, limit } = request.query as { before?: string; limit?: string };
    return chatService.listMessages(id, before, limit ? Number(limit) : undefined);
  });

  app.post(
    "/api/v1/chat/conversations/:id/messages",
    { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const access = await requireConversationAccess(request, id);
      const user = requireUser(request);
      const input = sendMessageSchema.parse(request.body);

      const message = await chatService.sendMessage(id, access.userId, user.name, input);

      reply.code(201);
      return message;
    },
  );

  app.delete("/api/v1/chat/messages/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const conversationId = await chatService.getMessageConversationId(id);
    const access = await requireConversationAccess(request, conversationId);
    await chatService.softDeleteMessage(id, access.userId);
    reply.code(204);
  });

  app.post("/api/v1/chat/messages/:id/reactions", async (request) => {
    const { id } = request.params as { id: string };
    const conversationId = await chatService.getMessageConversationId(id);
    const access = await requireConversationAccess(request, conversationId);
    const input = reactSchema.parse(request.body);
    return chatService.react(id, access.userId, input.emoji);
  });

  app.delete("/api/v1/chat/messages/:id/reactions/:emoji", async (request) => {
    const { id, emoji } = request.params as { id: string; emoji: string };
    const conversationId = await chatService.getMessageConversationId(id);
    const access = await requireConversationAccess(request, conversationId);
    return chatService.unreact(id, access.userId, decodeURIComponent(emoji));
  });

  app.post("/api/v1/chat/conversations/:id/attachments", async (request, reply) => {
    const { id } = request.params as { id: string };
    const access = await requireConversationAccess(request, id);

    const data = await request.file();
    if (!data) throw badRequest("No file was uploaded");
    const buffer = await data.toBuffer();

    const attachment = await chatService.saveChatAttachment({
      conversationId: id,
      uploadedBy: access.userId,
      filename: data.filename,
      mimeType: data.mimetype,
      buffer,
    });

    reply.code(201);
    return attachment;
  });

  app.get("/api/v1/chat/attachments/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const { row } = await chatService.getChatAttachment(id);
    await requireConversationAccess(request, row.conversationId);

    const fullPath = absoluteStoragePath(row.storagePath);
    const isPreviewable = PREVIEWABLE_MIME_PREFIXES.some((prefix) => row.mimeType.startsWith(prefix));

    reply.header("Content-Type", row.mimeType);
    reply.header("Content-Disposition", `${isPreviewable ? "inline" : "attachment"}; filename="${row.filename.replace(/[^\w.-]+/g, "_")}"`);
    return reply.send(fs.createReadStream(fullPath));
  });

  app.get("/api/v1/chat/search", async (request) => {
    const user = requireUser(request);
    const { q, limit } = request.query as { q?: string; limit?: string };
    return searchMessages(user.id, q ?? "", limit ? Number(limit) : 20);
  });

  app.post("/api/v1/chat/conversations/:id/read", async (request) => {
    const { id } = request.params as { id: string };
    const access = await requireConversationAccess(request, id);
    const input = markReadSchema.parse(request.body);
    await chatService.markRead(id, access.userId, input.upToMessageId);
    return { unreadConversationCount: await chatService.countUnreadConversations(access.userId) };
  });
}
