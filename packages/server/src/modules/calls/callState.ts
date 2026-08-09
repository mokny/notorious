import type { WebSocket } from "@fastify/websocket";

/**
 * Live "who is currently in this call right now" state - the server's
 * source of truth for late-join mesh bootstrapping (a new joiner's client
 * needs to know exactly who to connect to), kept in memory rather than the
 * DB since it changes on every join/leave and the DB `calls` row is only
 * written at transition points (start/answer/end), not per participant
 * change. Keyed by socket (mirrors chat/focusState.ts) since one user's
 * several tabs/devices can each be an independent call participant - no TTL
 * sweep needed, driven entirely by the socket's own "close" event (see
 * realtime/routes.ts).
 */
interface CallParticipantEntry {
  userId: string;
  clientId: string;
  callId: string;
  conversationId: string;
}

const participantsBySocket = new Map<WebSocket, CallParticipantEntry>();

export function registerParticipant(socket: WebSocket, entry: CallParticipantEntry): void {
  participantsBySocket.set(socket, entry);
}

/** Called on socket close (any reason) and on an explicit leave/hangup. Returns the removed entry, or null if this socket wasn't an active call participant. */
export function removeParticipant(socket: WebSocket): CallParticipantEntry | null {
  const entry = participantsBySocket.get(socket) ?? null;
  participantsBySocket.delete(socket);
  return entry;
}

/** Same as `removeParticipant`, but by identity instead of socket reference - for the REST leave/hangup path, which has no socket object to hand in (unlike the WS "close" event cleanup). */
export function removeParticipantByIds(userId: string, clientId: string, callId: string): CallParticipantEntry | null {
  for (const [socket, entry] of participantsBySocket) {
    if (entry.userId === userId && entry.clientId === clientId && entry.callId === callId) {
      participantsBySocket.delete(socket);
      return entry;
    }
  }
  return null;
}

export function getParticipants(callId: string): { userId: string; clientId: string }[] {
  const result: { userId: string; clientId: string }[] = [];
  for (const entry of participantsBySocket.values()) {
    if (entry.callId === callId) result.push({ userId: entry.userId, clientId: entry.clientId });
  }
  return result;
}

export function countParticipants(callId: string): number {
  let count = 0;
  for (const entry of participantsBySocket.values()) {
    if (entry.callId === callId) count += 1;
  }
  return count;
}

/** Backs the "Call in progress - N participants - Join" banner (ThreadView.tsx) and the REST fallback for a client that hasn't received a live callParticipants event yet. */
export function getActiveCallForConversation(conversationId: string): { callId: string; participantUserIds: string[] } | null {
  let callId: string | null = null;
  const participantUserIds = new Set<string>();
  for (const entry of participantsBySocket.values()) {
    if (entry.conversationId !== conversationId) continue;
    callId = entry.callId;
    participantUserIds.add(entry.userId);
  }
  return callId ? { callId, participantUserIds: [...participantUserIds] } : null;
}
