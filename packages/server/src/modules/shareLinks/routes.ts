import type { FastifyInstance } from "fastify";
import { createShareLinkSchema } from "@notorious/shared";
import { requireUser } from "../../plugins/session.js";
import { requireWorkspaceRole } from "../workspaces/access.js";
import { getWorkspace } from "../workspaces/service.js";
import * as shareLinkService from "./service.js";
import { notFound } from "../../lib/httpError.js";

/**
 * Sharing a whole workspace publicly is gated behind "owner" (it exposes
 * everything in it), while sharing a single object only needs "editor" - the
 * same bar as editing that object in the first place.
 */
export async function registerShareLinkRoutes(app: FastifyInstance): Promise<void> {
  app.post("/api/v1/workspaces/:workspaceId/share-links", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    const input = createShareLinkSchema.parse(request.body);
    await requireWorkspaceRole(workspaceId, user.id, input.objectId === null ? "owner" : "editor");
    const link = await shareLinkService.createShareLink(workspaceId, user.id, input);
    reply.code(201);
    return link;
  });

  app.get("/api/v1/workspaces/:workspaceId/share-links", async (request) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    const { objectId } = request.query as { objectId?: string };
    await requireWorkspaceRole(workspaceId, user.id, objectId ? "editor" : "owner");
    return shareLinkService.listShareLinks(workspaceId, objectId ?? null);
  });

  // Owner-only: every active share in the workspace at once (whole-workspace
  // and per-object alike), for Settings' consolidated list - a plain member
  // with editor access to one object shouldn't see every other object's
  // share links too, unlike the scoped listing above.
  app.get("/api/v1/workspaces/:workspaceId/share-links/all", async (request) => {
    const user = requireUser(request);
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceRole(workspaceId, user.id, "owner");
    return shareLinkService.listActiveShareLinksForWorkspace(workspaceId);
  });

  // For ShareDialog.tsx's "this also shares N linked objects" notice - same
  // editor bar as creating a single-object share in the first place.
  app.get("/api/v1/workspaces/:workspaceId/objects/:objectId/linked-share-preview", async (request) => {
    const user = requireUser(request);
    const { workspaceId, objectId } = request.params as { workspaceId: string; objectId: string };
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    return shareLinkService.listReachableLinkedObjects(objectId);
  });

  app.delete("/api/v1/workspaces/:workspaceId/share-links/:id", async (request, reply) => {
    const user = requireUser(request);
    const { workspaceId, id } = request.params as { workspaceId: string; id: string };
    await requireWorkspaceRole(workspaceId, user.id, "editor");
    await shareLinkService.revokeShareLink(workspaceId, id);
    reply.code(204);
  });

  // Public: no session required. Just enough info for the SPA to bootstrap the shared view.
  app.get("/api/v1/public/share/:token", async (request) => {
    const { token } = request.params as { token: string };
    const share = await shareLinkService.resolveShareToken(token);
    if (!share) throw notFound("This share link is invalid or has expired");
    const workspace = await getWorkspace(share.workspaceId);

    return {
      role: share.role,
      workspaceId: share.workspaceId,
      workspaceName: workspace.name,
      workspaceIcon: workspace.icon,
      objectId: share.objectId,
    };
  });
}
