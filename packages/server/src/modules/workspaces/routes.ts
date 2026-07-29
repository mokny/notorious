import type { FastifyInstance } from "fastify";
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
} from "@notorious/shared";
import { requireUser, getClientId } from "../../plugins/session.js";
import { requireWorkspaceRole } from "./access.js";
import { recordAndBroadcast } from "../realtime/activity.js";
import { getObjectWorkspaceId } from "../objects/service.js";
import { badRequest } from "../../lib/httpError.js";
import * as workspaceService from "./service.js";

export async function registerWorkspaceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/workspaces", async (request) => {
    const user = requireUser(request);
    return workspaceService.listWorkspacesForUser(user.id);
  });

  app.post("/api/v1/workspaces", async (request, reply) => {
    const user = requireUser(request);
    const input = createWorkspaceSchema.parse(request.body);
    const workspace = await workspaceService.createWorkspace(user.id, input);
    reply.code(201);
    return workspace;
  });

  app.get("/api/v1/workspaces/:id", async (request) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    await requireWorkspaceRole(id, user.id, "viewer");
    return workspaceService.getWorkspace(id);
  });

  app.patch("/api/v1/workspaces/:id", async (request) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    await requireWorkspaceRole(id, user.id, "editor");
    const input = updateWorkspaceSchema.parse(request.body);

    if (input.dashboardObjectId) {
      const objectWorkspaceId = await getObjectWorkspaceId(input.dashboardObjectId);
      if (objectWorkspaceId !== id) throw badRequest("Dashboard object must belong to this workspace");
    }

    const workspace = await workspaceService.updateWorkspace(id, input);

    await recordAndBroadcast({
      workspaceId: id,
      actorId: user.id,
      clientId: getClientId(request),
      action: "updated",
      summary: `${user.name} updated the workspace settings`,
      entity: "member",
      entityId: id,
      realtimeAction: "updated",
    });

    return workspace;
  });

  app.get("/api/v1/workspaces/:id/members", async (request) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    await requireWorkspaceRole(id, user.id, "viewer");
    return workspaceService.listMembers(id);
  });

  app.post("/api/v1/workspaces/:id/members", async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    await requireWorkspaceRole(id, user.id, "owner");
    const input = inviteMemberSchema.parse(request.body);
    const result = await workspaceService.inviteMember(id, user.id, input);

    await recordAndBroadcast({
      workspaceId: id,
      actorId: user.id,
      clientId: getClientId(request),
      action: "shared",
      summary: `${user.name} invited ${input.email} to the workspace`,
      entity: "member",
      entityId: id,
      realtimeAction: "created",
    });

    reply.code(201);
    return result;
  });

  app.patch("/api/v1/workspaces/:id/members/:userId", async (request) => {
    const user = requireUser(request);
    const { id, userId } = request.params as { id: string; userId: string };
    await requireWorkspaceRole(id, user.id, "owner");
    const input = updateMemberRoleSchema.parse(request.body);
    await workspaceService.updateMemberRole(id, userId, input.role);

    await recordAndBroadcast({
      workspaceId: id,
      actorId: user.id,
      clientId: getClientId(request),
      action: "updated",
      summary: `${user.name} changed a member's role`,
      entity: "member",
      entityId: userId,
      realtimeAction: "updated",
    });

    return { ok: true };
  });

  app.delete("/api/v1/workspaces/:id/members/:userId", async (request, reply) => {
    const user = requireUser(request);
    const { id, userId } = request.params as { id: string; userId: string };
    await requireWorkspaceRole(id, user.id, "owner");
    await workspaceService.removeMember(id, userId);

    await recordAndBroadcast({
      workspaceId: id,
      actorId: user.id,
      clientId: getClientId(request),
      action: "updated",
      summary: `${user.name} removed a member from the workspace`,
      entity: "member",
      entityId: userId,
      realtimeAction: "deleted",
    });

    reply.code(204);
  });

  app.get("/api/v1/workspaces/:id/invites", async (request) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    await requireWorkspaceRole(id, user.id, "owner");
    return workspaceService.listPendingInvites(id);
  });

  app.delete("/api/v1/workspaces/:id/invites/:inviteId", async (request, reply) => {
    const user = requireUser(request);
    const { id, inviteId } = request.params as { id: string; inviteId: string };
    await requireWorkspaceRole(id, user.id, "owner");
    await workspaceService.revokeInvite(id, inviteId);
    reply.code(204);
  });
}
