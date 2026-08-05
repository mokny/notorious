import type { FastifyInstance } from "fastify";
import { joinRoom } from "./hub.js";
import { getMemberRole } from "../workspaces/access.js";

/**
 * WebSocket endpoint clients connect to for live updates:
 * `wss://host/ws?workspaceId=...`. One socket per open workspace on the client;
 * the client re-connects when switching workspaces. An anonymous share-link
 * visitor connects the same way plus `&shareToken=...` (browsers can't set
 * custom headers on a WebSocket handshake, hence the query param - resolved
 * into `request.shareAccess` by the same session-plugin hook that resolves
 * the `X-Share-Token` header for the REST API, see plugins/session.ts) -
 * see `useRealtime.ts`.
 */
export async function registerRealtimeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/ws", { websocket: true }, async (socket, request) => {
    const { workspaceId, clientId } = request.query as { workspaceId?: string; clientId?: string };
    if (!workspaceId) {
      socket.close(4001, "Unauthorized");
      return;
    }

    const user = request.user;
    if (user) {
      const role = await getMemberRole(workspaceId, user.id);
      if (!role) {
        socket.close(4003, "Forbidden");
        return;
      }
      joinRoom(workspaceId, socket, null, clientId, user.id);
      return;
    }

    const share = request.shareAccess;
    if (share) {
      if (share.workspaceId !== workspaceId) {
        socket.close(4003, "Forbidden");
        return;
      }
      // A single-object share only ever gets events for that object (see
      // `broadcast` in ./hub.ts) - it must not learn that other objects in
      // the workspace exist or changed, same boundary the REST API enforces.
      joinRoom(workspaceId, socket, share.objectId, clientId);
      return;
    }

    socket.close(4001, "Unauthorized");
  });
}
