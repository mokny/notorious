import type { FastifyInstance } from "fastify";
import { joinRoom } from "./hub.js";
import { getMemberRole } from "../workspaces/access.js";
import { resolveShareToken } from "../shareLinks/service.js";

/**
 * WebSocket endpoint clients connect to for live updates:
 * `wss://host/ws?workspaceId=...`. One socket per open workspace on the client;
 * the client re-connects when switching workspaces. An anonymous share-link
 * visitor connects the same way plus `&shareToken=...` (browsers can't set
 * custom headers on a WebSocket handshake, hence the query param instead of
 * the `X-Share-Token` header the REST API uses) - see `useRealtime.ts`.
 */
export async function registerRealtimeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/ws", { websocket: true }, async (socket, request) => {
    const { workspaceId, shareToken } = request.query as { workspaceId?: string; shareToken?: string };
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
      joinRoom(workspaceId, socket);
      return;
    }

    if (shareToken) {
      const share = await resolveShareToken(shareToken);
      if (!share || share.workspaceId !== workspaceId) {
        socket.close(4003, "Forbidden");
        return;
      }
      // A single-object share only ever gets events for that object (see
      // `broadcast` in ./hub.ts) - it must not learn that other objects in
      // the workspace exist or changed, same boundary the REST API enforces.
      joinRoom(workspaceId, socket, share.objectId);
      return;
    }

    socket.close(4001, "Unauthorized");
  });
}
