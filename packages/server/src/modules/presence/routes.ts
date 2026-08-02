import type { FastifyInstance, FastifyRequest } from "fastify";
import { presenceHeartbeatSchema } from "@notorious/shared";
import { requireAccess } from "../workspaces/access.js";
import { getObjectWorkspaceId } from "../objects/service.js";
import { badRequest } from "../../lib/httpError.js";
import { broadcastPresence } from "../realtime/hub.js";
import * as state from "./state.js";
import { resolveAnonWord } from "./naming.js";

const SWEEP_INTERVAL_MS = 15_000;
/** ~2.4x the client's own heartbeat interval (see usePresence.ts) - tolerant of one missed beat plus network jitter before dropping a tab as gone. */
const STALE_AFTER_MS = 60_000;

interface Identity {
  identityKey: string;
  touch: state.TouchIdentity;
}

/**
 * A real member's identity comes from their own account; an anonymous
 * visitor's comes from a client-generated `visitorId` (see
 * lib/visitorIdentity.ts on the frontend) carried in the request body -
 * deliberately *not* `resolveActor()` (modules/workspaces/access.ts), which
 * intentionally collapses an anonymous editor to whoever *created* the
 * share link, for DB-attribution purposes. Presence needs the visitor's own
 * stable identity instead, not the link creator's.
 */
function resolveIdentity(request: FastifyRequest, body: { visitorId?: string; displayName?: string }): Identity {
  if (request.user) {
    return {
      identityKey: `member:${request.user.id}`,
      touch: { isAnonymous: false, userId: request.user.id, name: request.user.name, avatarColor: request.user.avatarColor },
    };
  }
  if (!body.visitorId) throw badRequest("visitorId is required for an anonymous viewer");
  const word = resolveAnonWord(body.visitorId, body.displayName);
  return {
    identityKey: `anon:${body.visitorId}`,
    touch: { isAnonymous: true, visitorId: body.visitorId, name: word },
  };
}

export async function registerPresenceRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/v1/objects/:objectId/presence", async (request) => {
    const { objectId } = request.params as { objectId: string };
    const workspaceId = await getObjectWorkspaceId(objectId);
    await requireAccess(request, workspaceId, "viewer", { objectId });
    return { viewers: state.computeSnapshot(objectId) };
  });

  app.post("/api/v1/objects/:objectId/presence", async (request) => {
    const { objectId } = request.params as { objectId: string };
    const workspaceId = await getObjectWorkspaceId(objectId);
    await requireAccess(request, workspaceId, "viewer", { objectId });

    const body = presenceHeartbeatSchema.parse(request.body);
    const identity = resolveIdentity(request, body);

    state.touch(objectId, workspaceId, identity.identityKey, identity.touch, body.tabId, Date.now());
    const viewers = state.computeSnapshot(objectId);
    broadcastPresence({ type: "presence", workspaceId, objectId, viewers });
    return { viewers };
  });

  app.delete("/api/v1/objects/:objectId/presence", async (request, reply) => {
    const { objectId } = request.params as { objectId: string };
    const workspaceId = await getObjectWorkspaceId(objectId);
    await requireAccess(request, workspaceId, "viewer", { objectId });

    const { visitorId, tabId } = request.query as { visitorId?: string; tabId?: string };
    const identityKey = request.user ? `member:${request.user.id}` : visitorId ? `anon:${visitorId}` : null;

    if (identityKey && tabId && state.removeTab(objectId, identityKey, tabId)) {
      broadcastPresence({ type: "presence", workspaceId, objectId, viewers: state.computeSnapshot(objectId) });
    }
    reply.code(204);
  });

  // Module-level, mirrors modules/webhooks/service.ts's existing precedent
  // for standalone process-lifetime timers - no `onClose` lifecycle hook
  // exists anywhere else in this codebase either, so none is added here.
  setInterval(() => {
    const changed = state.sweep(Date.now(), STALE_AFTER_MS);
    for (const { objectId, workspaceId } of changed) {
      broadcastPresence({ type: "presence", workspaceId, objectId, viewers: state.computeSnapshot(objectId) });
    }
  }, SWEEP_INTERVAL_MS);
}
