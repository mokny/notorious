import type { WebSocket } from "@fastify/websocket";
import type {
  BackupFilesChangedMessage,
  BackupProgressMessage,
  BackupScheduleChangedMessage,
  ChatRealtimeMessage,
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

// Chat needs a delivery path that isn't keyed by workspace at all - a DM has
// no workspace, and the unified conversation list must update live even for
// a user sitting on WorkspacePickerPage with no `roomsByWorkspace` room
// joined. Kept as a separate, additive map rather than folding a nullable
// workspaceId into `roomsByWorkspace` - that map's entire shape (object-id
// filtering for share links, `sendToUser`'s per-workspace room lookup)
// assumes a workspace exists, and share-link visitors (who must never see a
// global feed) have no `userId` to register here in the first place. See
// `realtime/routes.ts`'s separate `/ws/chat` endpoint.
const socketsByUserId = new Map<string, Set<WebSocket>>();

// Chat itself never needed to address one specific tab (every event fans
// out to all of a user's devices) - calls do: "stop ringing on my other
// devices" and signaling relay both need to reach exactly one socket. Kept
// as a separate parallel map rather than changing `socketsByUserId`'s value
// type, so every existing call site (`sendToUserGlobal`,
// `broadcastToConversation`) is untouched.
const clientIdBySocket = new Map<WebSocket, string>();

// Targets a forced logout (see `sendToSession`/auth/routes.ts's revoke-
// session endpoints) at exactly the device(s) that authenticated with one
// specific login session - unlike every other targeting map here, this is
// deliberately NOT scoped to a userId lookup first: the caller already knows
// the session belongs to that account (see plugins/session.ts's
// `revokeSession`), and a session id is unguessable enough that a flat map
// keyed on it directly is no less safe, just simpler.
const socketsBySessionId = new Map<string, Set<WebSocket>>();

/** Finds the actual WebSocket for one of a user's devices by clientId - REST call endpoints (answer/leave) have no socket of their own to hand in, but calls/callState.ts is keyed by socket, so this bridges the two. Undefined if that device isn't connected right now. */
export function getSocketForClient(userId: string, clientId: string): WebSocket | undefined {
  const sockets = socketsByUserId.get(userId);
  if (!sockets) return undefined;
  for (const socket of sockets) {
    if (clientIdBySocket.get(socket) === clientId) return socket;
  }
  return undefined;
}

/** Returns whether a user has at least one open `/ws/chat` socket right now - the source of truth for "online" used by the chat status gray-dot override (see `onUserOnlineChange`). */
export function isUserOnline(userId: string): boolean {
  return (socketsByUserId.get(userId)?.size ?? 0) > 0;
}

type OnlineChangeListener = (userId: string, online: boolean) => void;

// Fired only on the 0<->1 transition of a user's `/ws/chat` socket count (not
// on every extra tab connecting/closing) - chat/service.ts subscribes here to
// broadcast a `userStatusChanged` event to that user's chat contacts, since
// the hub itself has no DB access to look up who those contacts are.
const onlineChangeListeners = new Set<OnlineChangeListener>();

export function onUserOnlineChange(listener: OnlineChangeListener): void {
  onlineChangeListeners.add(listener);
}

function notifyOnlineChange(userId: string, online: boolean): void {
  for (const listener of onlineChangeListeners) listener(userId, online);
}

/** Registers a socket on the workspace-agnostic chat channel for one user and cleans up on disconnect. `clientId` identifies the browser tab/device (see lib/ws/clientId.ts on the frontend) - required (not optional like the older per-workspace `joinRoom`) since calls need every `/ws/chat` socket addressable. `sessionId` (the login session backing this connection, see plugins/session.ts's `getSessionId`) is optional only because a socket could theoretically authenticate some other way in the future - every real login always has one. */
export function joinGlobalRoom(userId: string, socket: WebSocket, clientId: string, sessionId?: string): void {
  let sockets = socketsByUserId.get(userId);
  const wasOnline = (sockets?.size ?? 0) > 0;
  if (!sockets) {
    sockets = new Set();
    socketsByUserId.set(userId, sockets);
  }
  sockets.add(socket);
  clientIdBySocket.set(socket, clientId);
  if (!wasOnline) notifyOnlineChange(userId, true);

  let sessionSockets: Set<WebSocket> | undefined;
  if (sessionId) {
    sessionSockets = socketsBySessionId.get(sessionId);
    if (!sessionSockets) {
      sessionSockets = new Set();
      socketsBySessionId.set(sessionId, sessionSockets);
    }
    sessionSockets.add(socket);
  }

  socket.on("close", () => {
    sockets?.delete(socket);
    if (sockets && sockets.size === 0) {
      socketsByUserId.delete(userId);
      notifyOnlineChange(userId, false);
    }
    clientIdBySocket.delete(socket);
    if (sessionId && sessionSockets) {
      sessionSockets.delete(socket);
      if (sessionSockets.size === 0) socketsBySessionId.delete(sessionId);
    }
  });
}

/** Forces a logout on exactly the device(s) currently connected under one specific login session - see auth/routes.ts's revoke-session endpoints. A no-op if that session has no open `/ws/chat` socket right now; the device still finds out its session is gone on its next REST request either way, this is purely the instant-logout path. */
export function sendToSession(sessionId: string, message: ChatRealtimeMessage): void {
  const sockets = socketsBySessionId.get(sessionId);
  if (!sockets) return;

  const payload = JSON.stringify(message);
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}

/** Sends a chat payload to every open socket belonging to one user (all their tabs/devices), workspace-agnostic. A no-op if they have no `/ws/chat` socket open right now. */
export function sendToUserGlobal(userId: string, message: ChatRealtimeMessage): void {
  const sockets = socketsByUserId.get(userId);
  if (!sockets) return;

  const payload = JSON.stringify(message);
  for (const socket of sockets) {
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}

/** Fans a chat payload out to a specific set of participant user ids - chat's own primitive on top of `sendToUserGlobal`, since conversations aren't a "room" concept the hub itself knows about (chat/service.ts already has the participant list from its own queries). */
export function broadcastToConversation(participantUserIds: string[], message: ChatRealtimeMessage): void {
  for (const userId of participantUserIds) sendToUserGlobal(userId, message);
}

/** Same fan-out as `sendToUserGlobal`, but skips the one device that already knows (e.g. the device that just answered a call) - "first to answer wins, stop ringing on my other devices." */
export function sendToUserGlobalExcept(userId: string, excludeClientId: string, message: ChatRealtimeMessage): void {
  const sockets = socketsByUserId.get(userId);
  if (!sockets) return;

  const payload = JSON.stringify(message);
  for (const socket of sockets) {
    if (clientIdBySocket.get(socket) === excludeClientId) continue;
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}

/** Targets exactly one of a user's devices/tabs by clientId - used for call-signaling relay (offer/answer/ICE candidate), which must reach the specific peer connection waiting for it, not every device the user has open. A no-op if that client isn't connected right now. */
export function sendToClientGlobal(userId: string, clientId: string, message: ChatRealtimeMessage): void {
  const sockets = socketsByUserId.get(userId);
  if (!sockets) return;

  const payload = JSON.stringify(message);
  for (const socket of sockets) {
    if (clientIdBySocket.get(socket) !== clientId) continue;
    if (socket.readyState === socket.OPEN) socket.send(payload);
  }
}
