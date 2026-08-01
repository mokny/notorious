import type { FastifyInstance } from "fastify";
import { createWebhookSchema, updateWebhookSchema } from "@notorious/shared";
import { requireUser } from "../../plugins/session.js";
import { requireWorkspaceRole } from "../workspaces/access.js";
import * as webhookService from "./service.js";

/**
 * Owner-only, same bar as workspace-wide public sharing (ShareDialog.tsx's
 * `objectId: null` case) - a webhook's payload includes the full current
 * state of whatever object changed, for any object in the workspace.
 */
export async function registerWebhookRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/workspaces/:workspaceId/webhooks", async (request) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    return webhookService.listWebhooks(workspaceId);
  });

  app.post("/api/v1/workspaces/:workspaceId/webhooks", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    const input = createWebhookSchema.parse(request.body);
    const webhook = await webhookService.createWebhook(workspaceId, user.id, input);
    reply.code(201);
    return webhook;
  });

  app.patch("/api/v1/workspaces/:workspaceId/webhooks/:id", async (request) => {
    const user = requireUser(request);
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    const input = updateWebhookSchema.parse(request.body);
    return webhookService.updateWebhook(workspaceId, id, input);
  });

  app.delete("/api/v1/workspaces/:workspaceId/webhooks/:id", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    await webhookService.deleteWebhook(workspaceId, id);
    reply.code(204);
  });

  app.post("/api/v1/workspaces/:workspaceId/webhooks/:id/test", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    await webhookService.sendTestWebhook(workspaceId, id);
    reply.code(204);
  });
}
