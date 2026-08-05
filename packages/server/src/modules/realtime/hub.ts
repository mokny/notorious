import type { WebSocket } from "@fastify/websocket";
import type {
  BackupFilesChangedMessage,
  BackupProgressMessage,
  BackupScheduleChangedMessage,
  NotificationMessage,
  PresenceSnapshotMessage,
  RealtimeEvent,
} from "@notorious/shared";

interface RoomEntry {
  objectIdFilter: string | null;
  /** The browser tab's `clientId` (see lib/ws/clientId.ts on the frontend), used to target a single client - e.g. `sendToClient` for backup progress - rather than the whole room. Absent for anonymous share visitors, who never trigger a targeted send. */
  clientId?: string;
  /** The real member's user id, absent for an anonymous share visitor - used only to target `sendToUser` (notifications), which a share visitor (no account, nothing to notify) never needs to receive. */
  userId?: string;
}

// Value is the socket's object-id filter: null for a real member or a
// whole-workspace share (sees every event in the room), a specific object id
// for a single-object share - which must not learn that *other* objects in
// the workspace exist/changed, any more than the REST API lets it fetch them.
const roomsByWorkspace = new Map<string, Map<WebSocket, RoomEntry>>();

/** Adds a socket to a workspace's broadcast room and cleans up on disconnect. */
export function joinRoom(
  workspaceId: string,
  socket: WebSocket,
  objectIdFilter: string | null = null,
  clientId?: string,
  userId?: string,
): void {
  let room = roomsByWorkspace.get(workspaceId);
  if (!room) {
    room = new Map();
    roomsByWorkspace.set(workspaceId, room);
  }
  room.set(socket, { objectIdFilter, clientId, userId });

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
  for (const [socket, entry] of room) {
    if (entry.objectIdFilter !== null && objectIdFilter !== entry.objectIdFilter) continue;
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

/** Broadcasts to every member viewing this workspace that a destination's backup file list changed - see `BackupFilesChangedMessage`'s doc comment. No object-id filter applies, so single-object shares (which never see the Backup settings section anyway) simply won't act on it. */
export function broadcastBackupFilesChanged(message: BackupFilesChangedMessage): void {
  sendToRoom(message.workspaceId, undefined, message);
}

/** Broadcasts to every member viewing this workspace that a backup run finished - see `BackupScheduleChangedMessage`'s doc comment. */
export function broadcastBackupScheduleChanged(message: BackupScheduleChangedMessage): void {
  sendToRoom(message.workspaceId, undefined, message);
}

/**
 * Sends a backup-progress update to exactly one client (identified by the
 * `clientId` it connected with, see `joinRoom`) rather than the whole
 * workspace room - see `BackupProgressMessage`'s doc comment for why. A
 * no-op if that client isn't currently connected (e.g. it navigated away
 * mid-transfer); the operation itself keeps running server-side regardless.
 */
export function sendToClient(workspaceId: string, clientId: string, message: BackupProgressMessage): void {
  const room = roomsByWorkspace.get(workspaceId);
  if (!room) return;

  const payload = JSON.stringify(message);
  for (const [socket, entry] of room) {
    if (entry.clientId !== clientId) continue;
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}

/**
 * Sends a notification to every open socket belonging to one specific user
 * (they may have several tabs/devices open) rather than the whole workspace
 * room - see `NotificationMessage`'s doc comment for why this needs its own
 * targeting instead of reusing `broadcast`. A no-op if that user has no
 * open socket on this workspace right now; they still see it next time they
 * fetch their notification list (see modules/notifications/service.ts) -
 * this is purely the live-update path, not the source of truth.
 */
export function sendToUser(workspaceId: string, userId: string, message: NotificationMessage): void {
  const room = roomsByWorkspace.get(workspaceId);
  if (!room) return;

  const payload = JSON.stringify(message);
  for (const [socket, entry] of room) {
    if (entry.userId !== userId) continue;
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}
