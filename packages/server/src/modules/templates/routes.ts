import type { FastifyInstance } from "fastify";
import { requireAccess } from "../workspaces/access.js";
import { getObjectWorkspaceId } from "../objects/service.js";
import { renderObjectBlocks } from "./renderer.js";

/**
 * Same viewer-level access check as the raw `GET .../blocks` endpoint
 * (blocks/routes.ts) - a real member or a share visitor covered by their
 * link. That's the boundary for *seeing this object's blocks at all*;
 * cross-object references inside a template are checked again, individually,
 * inside renderObjectBlocks itself (see its own `assertCanViewObject`).
 */
export async function registerTemplateRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/objects/:objectId/blocks/rendered", async (request) => {
    const { objectId } = request.params as { objectId: string };
    const workspaceId = await getObjectWorkspaceId(objectId);
    await requireAccess(request, workspaceId, "viewer", { objectId });
    const rendered = await renderObjectBlocks(objectId, {
      userId: request.user?.id,
      shareAccess: request.shareAccess ?? undefined,
    });
    return { rendered };
  });
}
