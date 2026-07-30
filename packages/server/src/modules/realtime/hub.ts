import type { WebSocket } from "@fastify/websocket";
import type { RealtimeEvent } from "@notorious/shared";

// Value is the socket's object-id filter: null for a real member or a
// whole-workspace share (sees every event in the room), a specific object id
// for a single-object share - which must not learn that *other* objects in
// the workspace exist/changed, any more than the REST API lets it fetch them.
const roomsByWorkspace = new Map<string, Map<WebSocket, string | null>>();

/** Adds a socket to a workspace's broadcast room and cleans up on disconnect. */
export function joinRoom(workspaceId: string, socket: WebSocket, objectIdFilter: string | null = null): void {
  let room = roomsByWorkspace.get(workspaceId);
  if (!room) {
    room = new Map();
    roomsByWorkspace.set(workspaceId, room);
  }
  room.set(socket, objectIdFilter);

  socket.on("close", () => {
    room?.delete(socket);
    if (room && room.size === 0) roomsByWorkspace.delete(workspaceId);
  });
}

/** Broadcasts a change event to every client currently viewing this workspace, honoring each socket's object-id filter (see `joinRoom`). */
export function broadcast(event: RealtimeEvent): void {
  const room = roomsByWorkspace.get(event.workspaceId);
  if (!room) return;

  const payload = JSON.stringify(event);
  for (const [socket, filter] of room) {
    if (filter !== null && event.objectId !== filter) continue;
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}
