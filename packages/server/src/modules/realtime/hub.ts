import type { WebSocket } from "@fastify/websocket";
import type { RealtimeEvent } from "@notorious/shared";

const roomsByWorkspace = new Map<string, Set<WebSocket>>();

/** Adds a socket to a workspace's broadcast room and cleans up on disconnect. */
export function joinRoom(workspaceId: string, socket: WebSocket): void {
  let room = roomsByWorkspace.get(workspaceId);
  if (!room) {
    room = new Set();
    roomsByWorkspace.set(workspaceId, room);
  }
  room.add(socket);

  socket.on("close", () => {
    room?.delete(socket);
    if (room && room.size === 0) roomsByWorkspace.delete(workspaceId);
  });
}

/** Broadcasts a change event to every client currently viewing this workspace. */
export function broadcast(event: RealtimeEvent): void {
  const room = roomsByWorkspace.get(event.workspaceId);
  if (!room) return;

  const payload = JSON.stringify(event);
  for (const socket of room) {
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}
