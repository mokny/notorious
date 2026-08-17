import type { FastifyInstance } from "fastify";
import { requireUser } from "../../plugins/session.js";
import { requireWorkspaceRole } from "../workspaces/access.js";
import { getObjectWorkspaceId } from "../objects/service.js";
import * as subscriptionService from "./service.js";

/**
 * Members-only, full stop - deliberately routed through `requireWorkspaceRole`
 * (not `requireAccess`), so an anonymous share-link visitor never sees or
 * reaches these (see workspaces/access.ts's `resolveActor`, which would
 * otherwise collapse an anonymous editor onto the link creator - wrong for a
 * per-user subscription).
 */
export async function registerSubscriptionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/objects/:id/subscription", async (request) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const workspaceId = await getObjectWorkspaceId(id);
    await requireWorkspaceRole(workspaceId, user.id, "viewer");
    return { subscribed: await subscriptionService.isSubscribed(id, user.id) };
  });

  app.post("/api/v1/objects/:id/subscription", async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const workspaceId = await getObjectWorkspaceId(id);
    await requireWorkspaceRole(workspaceId, user.id, "viewer");
    await subscriptionService.subscribe(workspaceId, id, user.id);
    reply.code(204);
  });

  app.delete("/api/v1/objects/:id/subscription", async (request, reply) => {
    const user = requireUser(request);
    const { id } = request.params as { id: string };
    const workspaceId = await getObjectWorkspaceId(id);
    await requireWorkspaceRole(workspaceId, user.id, "viewer");
    await subscriptionService.unsubscribe(id, user.id);
    reply.code(204);
  });
}
