import type { WebSocket } from "@fastify/websocket";
import type { PresenceSnapshotMessage, RealtimeEvent } from "@notorious/shared";

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

/** Sends `payload` to every socket in `workspaceId`'s room, honoring each socket's object-id filter (see `joinRoom`) against `objectIdFilter`. Shared by `broadcast`/`broadcastPresence` - the only difference between a `RealtimeEvent` and a `PresenceSnapshotMessage` broadcast is which field carries the object id. */
function sendToRoom(workspaceId: string, objectIdFilter: string | null | undefined, payload: unknown): void {
  const room = roomsByWorkspace.get(workspaceId);
  if (!room) return;

  const message = JSON.stringify(payload);
  for (const [socket, filter] of room) {
    if (filter !== null && objectIdFilter !== filter) continue;
    if (socket.readyState === socket.OPEN) socket.send(message);
  }
}

/** Broadcasts a change event to every client currently viewing this workspace, honoring each socket's object-id filter (see `joinRoom`). */
export function broadcast(event: RealtimeEvent): void {
  sendToRoom(event.workspaceId, event.objectId, event);
}

/**
 * Broadcasts the current viewer list for one object - see
 * `modules/presence/`. Reuses the same room/object-filter machinery as
 * `broadcast`, so a single-object share's socket only ever learns about
 * presence on *its own* object, exactly like every other event type.
 */
export function broadcastPresence(message: PresenceSnapshotMessage): void {
  sendToRoom(message.workspaceId, message.objectId, message);
}
