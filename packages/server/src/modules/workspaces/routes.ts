import type { FastifyInstance } from "fastify";
import {
  createWorkspaceSchema,
  updateWorkspaceSchema,
  inviteMemberSchema,
  updateMemberRoleSchema,
  pinObjectSchema,
  movePinSchema,
  reorderWorkspaceSchema,
  touchRecentlyViewedSchema,
} from "@notorious/shared";
import { requireUser, getClientId } from "../../plugins/session.js";
import { requireWorkspaceRole, requireAccess, requireWorkspaceScopedAccess } from "./access.js";
import { recordAndBroadcast } from "../realtime/activity.js";
import { sendToUserGlobal } from "../realtime/hub.js";
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

  // Personal to the acting user - reorders their own workspace list (left
  // rail + workspace picker), not something other members see or need edit
  // rights to change, so "viewer" (mere membership) is enough. Broadcast is
  // over the workspace-agnostic `/ws/chat` channel (see
  // `WorkspaceOrderChangedEvent`'s doc comment), not `recordAndBroadcast` -
  // this isn't workspace activity other members care about, and the acting
  // user may be sitting on WorkspacePickerPage with no workspace room joined.
  app.post("/api/v1/workspaces/:id/reorder", async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    await requireWorkspaceRole(id, user.id, "viewer");
    const input = reorderWorkspaceSchema.parse(request.body);
    await workspaceService.reorderWorkspace(user.id, id, input.afterWorkspaceId);
    sendToUserGlobal(user.id, { type: "workspaceOrderChanged" });
    reply.code(204);
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

  // Drives the web app's "land on my dashboard" redirect at "/" - the dashboard object of the
  // most recently active workspace (by recently-viewed rows) across ALL of this user's
  // workspaces, or null if there isn't one (new user, or that workspace has no dashboard). See
  // getLastVisitedWorkspace's doc comment for why no separate access check is needed here.
  app.get("/api/v1/workspaces/last-visited", async (request) => {
    const user = requireUser(request);
    return workspaceService.getLastVisitedWorkspace(user.id);
  });

  app.patch("/api/v1/workspaces/:id", async (request) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    await requireWorkspaceRole(id, user.id, "editor");
    const input = updateWorkspaceSchema.parse(request.body);

    // Company banner fields are owner-only, unlike the rest of this route's
    // fields (editor+) - see schemas/workspace.ts.
    const companyBannerFields: (keyof typeof input)[] = [
      "companyName",
      "companyCover",
      "companyBannerHeight",
      "companyBannerTextColor",
      "companyBannerBackgroundColor",
      "companyBannerBold",
      "companyBannerItalic",
      "companyBannerLetterSpacing",
      "companyBannerTextAlign",
      "companyBannerFadeEnabled",
      "companyBannerGradientEnabled",
      "companyBannerBackgroundColor2",
      "companyBannerGradientAngle",
      "companyBannerGradientStartPosition",
      "companyBannerTextShadow",
      "companyBannerFontFamily",
      "companyBannerPosition",
    ];
    if (companyBannerFields.some((field) => field in input)) {
      await requireWorkspaceRole(id, user.id, "owner");
    }

    // Setting the dashboard is owner-only (unlike the rest of this route's fields, editor+) - see
    // the same pattern above for company banner fields. A workspace must always have a dashboard,
    // so unsetting it (null) without pointing at a replacement object is rejected outright.
    if ("dashboardObjectId" in input) {
      await requireWorkspaceRole(id, user.id, "owner");
      if (!input.dashboardObjectId) throw badRequest("A workspace must always have a dashboard");
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
