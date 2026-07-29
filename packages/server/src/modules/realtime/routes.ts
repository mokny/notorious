import type { FastifyInstance } from "fastify";
import { joinRoom } from "./hub.js";
import { getMemberRole } from "../workspaces/access.js";

/**
 * WebSocket endpoint clients connect to for live updates:
 * `wss://host/ws?workspaceId=...`. One socket per open workspace on the client;
 * the client re-connects when switching workspaces.
 */
export async function registerRealtimeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/ws", { websocket: true }, async (socket, request) => {
    const workspaceId = (request.query as { workspaceId?: string }).workspaceId;
    const user = request.user;

    if (!user || !workspaceId) {
      socket.close(4001, "Unauthorized");
      return;
    }

    const role = await getMemberRole(workspaceId, user.id);
    if (!role) {
      socket.close(4003, "Forbidden");
      return;
    }

    joinRoom(workspaceId, socket);
  });
}
