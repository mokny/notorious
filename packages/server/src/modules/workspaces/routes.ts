import type { FastifyInstance } from "fastify";
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  pinObjectSchema,
  movePinSchema,
  touchRecentlyViewedSchema,
} from "@notorious/shared";
import { requireUser, getClientId } from "../../plugins/session.js";
import { requireWorkspaceRole, requireAccess, requireWorkspaceScopedAccess } from "./access.js";
import { recordAndBroadcast } from "../realtime/activity.js";
import { getObjectWorkspaceId } from "../objects/service.js";
import { badRequest } from "../../lib/httpError.js";
import * as workspaceService from "./service.js";

// Applies to both "recently edited" and "recently viewed" - kept in sync per
// the same product decision, not a technical constraint of either query.
const RECENT_LIMIT = 5;

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
    const { id } = request.params as { id: string };
    await requireAccess(request, id, "viewer");
    return workspaceService.getWorkspace(id);
  });

  app.get("/api/v1/workspaces/:id/recent-edits", async (request) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    await requireWorkspaceRole(id, user.id, "viewer");
    return workspaceService.listRecentlyEditedObjectIds(id, user.id, RECENT_LIMIT);
  });

  // Pinned objects are a workspace-wide "quick navigation" list, like the
  // dashboard object - viewable by anyone with access to the workspace,
  // including an anonymous whole-workspace share visitor (see
  // requireWorkspaceScopedAccess), but only editable by real members with at
  // least editor rights, since changing it changes what *everyone* sees.
  app.get("/api/v1/workspaces/:id/pins", async (request) => {
    const { id } = request.params as { id: string };
    await requireWorkspaceScopedAccess(request, id, "viewer");
    return workspaceService.listPins(id);
  });

  app.post("/api/v1/workspaces/:id/pins", async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    await requireWorkspaceRole(id, user.id, "editor");
    const input = pinObjectSchema.parse(request.body);
    const objectWorkspaceId = await getObjectWorkspaceId(input.objectId);
    if (objectWorkspaceId !== id) throw badRequest("Object must belong to this workspace");
    await workspaceService.pinObject(id, input.objectId);

    // Not tied to `objectId` here (omitted) - a pin change isn't an edit *of*
    // that object, and logging it against one would wrongly surface it in
    // that object's "recently edited" list (see listRecentlyEditedObjectIds).
    await recordAndBroadcast({
      workspaceId: id,
      actorId: user.id,
      clientId: getClientId(request),
      action: "updated",
      summary: `${user.name} pinned an object`,
      entity: "pin",
      entityId: input.objectId,
      realtimeAction: "created",
    });

    reply.code(204);
  });

  app.delete("/api/v1/workspaces/:id/pins/:objectId", async (request, reply) => {
    const user = requireUser(request);
    const { id, objectId } = request.params as { id: string; objectId: string };
    await requireWorkspaceRole(id, user.id, "editor");
    await workspaceService.unpinObject(id, objectId);

    await recordAndBroadcast({
      workspaceId: id,
      actorId: user.id,
      clientId: getClientId(request),
      action: "updated",
      summary: `${user.name} unpinned an object`,
      entity: "pin",
      entityId: objectId,
      realtimeAction: "deleted",
    });

    reply.code(204);
  });

  app.post("/api/v1/workspaces/:id/pins/:objectId/move", async (request, reply) => {
    const user = requireUser(request);
    const { id, objectId } = request.params as { id: string; objectId: string };
    await requireWorkspaceRole(id, user.id, "editor");
    const input = movePinSchema.parse(request.body);
    await workspaceService.movePin(id, objectId, input.afterObjectId);

    await recordAndBroadcast({
      workspaceId: id,
      actorId: user.id,
      clientId: getClientId(request),
      action: "updated",
      summary: `${user.name} reordered the pinned objects`,
      entity: "pin",
      entityId: objectId,
      realtimeAction: "updated",
    });

    reply.code(204);
  });

  // "Recently viewed" stays a per-user, device-synced preference (see
  // recently_viewed in db/schema.ts) - real membership only, not exposed to
  // anonymous share-link visitors (there's no account to sync it against).

  app.get("/api/v1/workspaces/:id/recently-viewed", async (request) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    await requireWorkspaceRole(id, user.id, "viewer");
    return workspaceService.listRecentlyViewed(id, user.id, RECENT_LIMIT);
  });

  app.post("/api/v1/workspaces/:id/recently-viewed", async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    await requireWorkspaceRole(id, user.id, "viewer");
    const input = touchRecentlyViewedSchema.parse(request.body);
    await workspaceService.touchRecentlyViewed(id, user.id, input.objectId);
    reply.code(204);
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

  // Owner-only, unlike the rename/icon PATCH above (editor+): deleting the
  // whole workspace is irreversible and takes everyone's access with it, not
  // just a setting the owner happens to also let editors change.
  app.delete("/api/v1/workspaces/:id", async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    await requireWorkspaceRole(id, user.id, "owner");
    await workspaceService.deleteWorkspace(id);
    reply.code(204);
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
