import { eq } from "drizzle-orm";
import type { WebSocket } from "@fastify/websocket";
import type { Call, CallStatus, CallSummary, ActiveCallSummary } from "@notorious/shared";
import { db } from "../../db/client.js";
import { calls, messages, users } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { notFound, conflict } from "../../lib/httpError.js";
import { sendToUserGlobal, sendToClientGlobal, sendToUserGlobalExcept, getSocketForClient } from "../realtime/hub.js";
import { notifyUser } from "../push/service.js";
import { getParticipantUserIds, toMessage } from "../chat/service.js";
import * as callState from "./callState.js";
import * as sfu from "./sfu.js";

const MAX_PARTICIPANTS = 6;
const RING_TIMEOUT_MS = 60_000;

const ringTimeouts = new Map<string, ReturnType<typeof setTimeout>>();

function toCall(row: typeof calls.$inferSelect): Call {
  return {
    id: row.id,
    conversationId: row.conversationId,
    initiatorId: row.initiatorId,
    status: row.status,
    startedAt: row.startedAt,
    answeredAt: row.answeredAt,
    endedAt: row.endedAt,
    participantIds: JSON.parse(row.participantIds) as string[],
  };
}

async function getCall(callId: string): Promise<typeof calls.$inferSelect> {
  const rows = await db.select().from(calls).where(eq(calls.id, callId)).limit(1);
  if (!rows[0]) throw notFound("Call not found");
  return rows[0];
}

function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}:${remainingSeconds.toString().padStart(2, "0")}`;
}

/** Writes the call-outcome history row and broadcasts it as an ordinary `chatMessage` event - ThreadView/MessageBubble already invalidate/render on that event, no new WS type needed for this. */
async function writeCallHistoryMessage(row: typeof calls.$inferSelect): Promise<void> {
  const authorRows = await db.select({ name: users.name }).from(users).where(eq(users.id, row.initiatorId)).limit(1);
  const authorName = authorRows[0]?.name ?? "Someone";

  const durationSeconds = row.status === "ended" && row.answeredAt && row.endedAt ? Math.round((Date.parse(row.endedAt) - Date.parse(row.answeredAt)) / 1000) : null;

  const fallbackBody =
    row.status === "missed"
      ? "Missed call"
      : row.status === "declined"
        ? "Declined call"
        : `Call ended · ${formatDuration(durationSeconds ?? 0)}`;

  const id = newId();
  const createdAt = row.endedAt ?? nowIso();
  await db.insert(messages).values({ id, conversationId: row.conversationId, authorId: row.initiatorId, body: fallbackBody, createdAt, deletedAt: null, callId: row.id });

  const call: CallSummary = { callId: row.id, status: row.status, startedAt: row.startedAt, durationSeconds, participantIds: JSON.parse(row.participantIds) as string[] };
  const message = toMessage({ id, conversationId: row.conversationId, authorId: row.initiatorId, body: fallbackBody, createdAt, deletedAt: null, callId: row.id }, authorName, [], [], [], call);

  const participantUserIds = await getParticipantUserIds(row.conversationId);
  for (const userId of participantUserIds) sendToUserGlobal(userId, { type: "chatMessage", conversationId: row.conversationId, message });
}

async function endCall(callId: string, status: Extract<CallStatus, "ended" | "missed" | "declined">, reason: "hangup" | "declined" | "missed"): Promise<void> {
  clearTimeout(ringTimeouts.get(callId));
  ringTimeouts.delete(callId);

  const row = await getCall(callId);
  if (row.status === "ended" || row.status === "missed" || row.status === "declined") return;

  const participantIds = [...new Set(callState.getParticipants(callId).map((p) => p.userId))];
  const endedAt = nowIso();
  await db.update(calls).set({ status, endedAt, participantIds: JSON.stringify(participantIds) }).where(eq(calls.id, callId));
  sfu.closeRouter(callId);

  const updated = await getCall(callId);
  await writeCallHistoryMessage(updated);

  const conversationParticipantIds = await getParticipantUserIds(row.conversationId);
  for (const userId of conversationParticipantIds) sendToUserGlobal(userId, { type: "callEnded", callId, conversationId: row.conversationId, reason });
}

/** Any conversation participant, any role - open/joinable by everyone in the conversation, same "open by design" spirit as workspace channels. */
export async function startCall(conversationId: string, initiatorId: string, initiatorName: string): Promise<Call> {
  const existing = callState.getActiveCallForConversation(conversationId);
  if (existing) return toCall(await getCall(existing.callId));

  const id = newId();
  // Fail fast, before any DB write, if the SFU can't come up (e.g.
  // MEDIA_ANNOUNCED_IP unset) - no point creating a "ringing" call whose
  // media could never connect anyway.
  await sfu.getOrCreateRouter(id);

  const startedAt = nowIso();
  await db.insert(calls).values({ id, conversationId, initiatorId, status: "ringing", startedAt, answeredAt: null, endedAt: null, participantIds: "[]" });

  const recipientUserIds = (await getParticipantUserIds(conversationId)).filter((userId) => userId !== initiatorId);
  for (const userId of recipientUserIds) {
    sendToUserGlobal(userId, { type: "callRing", callId: id, conversationId, initiatorId, initiatorName });
    await notifyUser(userId, { title: `${initiatorName} is calling`, body: "Tap to join", url: `/messages/${conversationId}` });
  }

  ringTimeouts.set(
    id,
    setTimeout(() => {
      void endCall(id, "missed", "missed");
    }, RING_TIMEOUT_MS),
  );

  return toCall(await getCall(id));
}

/** Registers this device as an active participant - transitions ringing -> active on the first accept, a no-op status-wise for a late join to an already-active call. Enforces the hard cap of 6. Requires the caller's `/ws/chat` socket to already be connected (answering with no live socket makes no sense - there'd be nothing to relay signaling over). */
export async function answerCall(callId: string, userId: string, clientId: string): Promise<Call> {
  const row = await getCall(callId);
  if (row.status === "ended" || row.status === "missed" || row.status === "declined") throw conflict("This call has ended");

  if (callState.countParticipants(callId) >= MAX_PARTICIPANTS) throw conflict("This call is full");

  const socket = getSocketForClient(userId, clientId);
  if (!socket) throw conflict("Your chat connection isn't open - reload and try again");

  const isFirstAnswer = row.status === "ringing";
  if (isFirstAnswer) {
    clearTimeout(ringTimeouts.get(callId));
    ringTimeouts.delete(callId);
    await db.update(calls).set({ status: "active", answeredAt: nowIso() }).where(eq(calls.id, callId));
  }

  callState.registerParticipant(socket, { userId, clientId, callId, conversationId: row.conversationId });
  sendToUserGlobalExcept(userId, clientId, { type: "callTaken", callId });

  const participants = callState.getParticipants(callId);
  for (const participant of participants) {
    sendToClientGlobal(participant.userId, participant.clientId, { type: "callParticipants", callId, conversationId: row.conversationId, participants });
  }

  return toCall(await getCall(callId));
}

/** Only meaningful while nobody has joined yet - if the call is already active (someone else joined), declining is purely local to the declining client (it just closes its own ringing banner), nothing to tell the server. `_userId` kept in the signature for symmetry with the other call actions even though this one doesn't need to know who's declining. */
export async function declineCall(callId: string, _userId: string): Promise<void> {
  const row = await getCall(callId);
  if (row.status !== "ringing") return;
  if (callState.countParticipants(callId) > 0) return;
  await endCall(callId, "declined", "declined");
}

async function handleParticipantLeft(callId: string, conversationId: string): Promise<void> {
  const remaining = callState.getParticipants(callId);
  if (remaining.length === 0) {
    await endCall(callId, "ended", "hangup");
    return;
  }
  for (const participant of remaining) {
    sendToClientGlobal(participant.userId, participant.clientId, { type: "callParticipants", callId, conversationId, participants: remaining });
  }
}

/** Removes this device from the call; if it was the last participant, the call ends (`ended`, with duration + history row). */
export async function leaveCall(callId: string, userId: string, clientId: string): Promise<void> {
  const removed = callState.removeParticipantByIds(userId, clientId, callId);
  if (!removed) return;
  await handleParticipantLeft(removed.callId, removed.conversationId);
}

/** Called from the socket's "close" handler (realtime/routes.ts) - a tab/device disconnecting is just another way of leaving. */
export async function leaveCallBySocket(socket: WebSocket): Promise<void> {
  const entry = callState.removeParticipant(socket);
  if (!entry) return;
  await handleParticipantLeft(entry.callId, entry.conversationId);
}

export function getActiveCallSummary(conversationId: string): ActiveCallSummary | null {
  const active = callState.getActiveCallForConversation(conversationId);
  if (!active) return null;
  return { callId: active.callId, conversationId, participantUserIds: active.participantUserIds };
}
