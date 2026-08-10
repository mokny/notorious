import type { FastifyInstance } from "fastify";
import { saveWorkspaceAiConfigSchema, patchWorkspaceAiConfigSchema, sendChatMessageSchema } from "@notorious/shared";
import { requireUser } from "../../plugins/session.js";
import { requireWorkspaceRole } from "../workspaces/access.js";
import * as aiService from "./service.js";
import { sendChatMessage } from "./agent.js";

export async function registerAiRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/ai/configured-workspaces", async (request) => {
    const user = requireUser(request);
    const { workspaceId } = request.query as { workspaceId?: string };
    return aiService.listAiConfiguredWorkspacesForUser(user.id, workspaceId);
  });

  app.get("/api/v1/workspaces/:workspaceId/ai/config", async (request) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "viewer");
    return aiService.getWorkspaceAiConfigSummary(workspaceId);
  });

  app.put("/api/v1/workspaces/:workspaceId/ai/config", async (request) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    const input = saveWorkspaceAiConfigSchema.parse(request.body);
    return aiService.saveWorkspaceAiConfig(workspaceId, input);
  });

  app.patch("/api/v1/workspaces/:workspaceId/ai/config", async (request) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    const input = patchWorkspaceAiConfigSchema.parse(request.body);
    return aiService.patchWorkspaceAiConfig(workspaceId, input);
  });

  app.delete("/api/v1/workspaces/:workspaceId/ai/config", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    await aiService.deleteWorkspaceAiConfig(workspaceId);
    reply.code(204);
  });

  app.get("/api/v1/workspaces/:workspaceId/ai/chat", async (request) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    return aiService.listChatMessages(user.id, workspaceId);
  });

  app.post("/api/v1/workspaces/:workspaceId/ai/chat", async (request) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    const input = sendChatMessageSchema.parse(request.body);
    return sendChatMessage(user.id, workspaceId, input.message);
  });

  app.delete("/api/v1/workspaces/:workspaceId/ai/chat", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    await aiService.clearChatHistory(user.id, workspaceId);
    reply.code(204);
  });
}
