import type { FastifyInstance } from "fastify";
import { requireAccess, requireWorkspaceScopedAccess } from "../workspaces/access.js";
import { getObjectWorkspaceId } from "../objects/service.js";
import { renderObjectBlocks } from "./renderer.js";
import { listObjectTypes, listProperties } from "../schema/service.js";

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

  /**
   * Bundles every object type's key + its properties in one call - what the
   * web editor's template autocomplete needs to suggest `object.<prop>`,
   * `objects.<slug>.<prop>`, and `objects.where(type="...", <prop>="...")`
   * completions without an N+1 round trip per type. Object slugs and
   * `variables.<Name>` names aren't included here - the client already has a
   * fuzzy-search endpoint (`GET /workspaces/:id/search`) for those, filtered
   * client-side by type key ("variable" for variables).
   */
  app.get("/api/v1/workspaces/:workspaceId/templates/autocomplete-schema", async (request) => {
    const { workspaceId } = request.params as { workspaceId: string };
    await requireWorkspaceScopedAccess(request, workspaceId, "viewer");
    const types = await listObjectTypes(workspaceId);
    const objectTypes = await Promise.all(
      types.map(async (type) => ({
        id: type.id,
        key: type.key,
        name: type.name,
        properties: (await listProperties(type.id)).map((p) => ({ key: p.key, name: p.name, type: p.type })),
      })),
    );
    return { objectTypes };
  });
}
