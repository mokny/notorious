import type { Message, MessageReaction, ReadReceipt } from "./chat.js";
import type { CallSignalPayload } from "./callSignal.js";

/**
 * All chat WebSocket payloads share the workspace-agnostic `/ws/chat`
 * connection (see `lib/ws/useGlobalRealtime.ts` on the frontend,
 * `modules/realtime/hub.ts::sendToUserGlobal`/`broadcastToConversation` on
 * the server) - distinguished from each other, and from the per-workspace
 * `RealtimeEvent`, purely by `type`, same convention as
 * `NotificationMessage`/`BackupProgressMessage` in entities.ts.
 */

export interface ChatMessageEvent {
  type: "chatMessage";
  conversationId: string;
  message: Message;
}

export interface ChatMessageDeletedEvent {
  type: "chatMessageDeleted";
  conversationId: string;
  messageId: string;
}

export interface ChatReactionEvent {
  type: "chatReaction";
  conversationId: string;
  messageId: string;
  reactions: MessageReaction[];
}

export interface ChatReadReceiptEvent {
  type: "chatReadReceipt";
  conversationId: string;
  receipts: ReadReceipt[];
}

/** Ephemeral only - never persisted, never replayed on reconnect. */
export interface ChatTypingEvent {
  type: "chatTyping";
  conversationId: string;
  userId: string;
  userName: string;
}

/** A conversation was created, or a participant was added/removed - tells the unified list to refetch. */
export interface ChatConversationEvent {
  type: "chatConversation";
  conversationId: string;
}

/**
 * Drives the PWA app-icon badge (`lib/chatBadge.ts`) without requiring a
 * full conversation-list refetch just to recompute the count. Count is the
 * number of conversations with >=1 unread message, not total unread
 * messages - see the chat feature plan for why.
 */
export interface ChatUnreadCountEvent {
  type: "chatUnreadCount";
  unreadConversationCount: number;
}

/**
 * Sent to every conversation participant (including the caller's own other
 * devices) when a call starts - see chat/calls/service.ts::startCall.
 */
export interface CallRingEvent {
  type: "callRing";
  callId: string;
  conversationId: string;
  initiatorId: string;
  initiatorName: string;
}

/**
 * Sent to a callee's OTHER devices/tabs once one of them answers (see
 * `sendToUserGlobalExcept` in realtime/hub.ts) - silences ringing there,
 * "first to answer wins."
 */
export interface CallTakenEvent {
  type: "callTaken";
  callId: string;
}

/**
 * Full roster snapshot (not a join/leave delta - same "supersede, don't
 * reconcile" reasoning as PresenceSnapshotMessage in entities.ts) sent to
 * every current call participant whenever someone joins or leaves. Also the
 * signal existing participants use to know they must initiate a fresh
 * RTCPeerConnection offer to a newcomer (see CallContext.tsx's late-join
 * renegotiation rule) - `joinerUserId`/`joinerClientId` are set only on the
 * broadcast triggered by a join, letting existing participants distinguish
 * "the new person" from the rest of the roster without a separate event.
 */
export interface CallParticipantsEvent {
  type: "callParticipants";
  callId: string;
  conversationId: string;
  participants: { userId: string; clientId: string }[];
  joinerUserId?: string;
  joinerClientId?: string;
}

/**
 * Pure relay - the server never inspects `signal`, just forwards it from
 * one specific socket to another (see realtime/hub.ts::sendToClient and
 * realtime/routes.ts's `callSignal` case).
 */
export interface CallSignalEvent {
  type: "callSignal";
  callId: string;
  fromUserId: string;
  fromClientId: string;
  toUserId: string;
  toClientId: string;
  signal: CallSignalPayload;
}

/** The call ended (last participant left, or it was declined/missed before anyone joined) - conversationId lets `getActiveCall` state clear even for a client that isn't currently in the call. */
export interface CallEndedEvent {
  type: "callEnded";
  callId: string;
  conversationId: string;
  reason: "hangup" | "declined" | "missed";
}

export type ChatRealtimeMessage =
  | ChatMessageEvent
  | ChatMessageDeletedEvent
  | ChatReactionEvent
  | ChatReadReceiptEvent
  | ChatTypingEvent
  | ChatConversationEvent
  | ChatUnreadCountEvent
  | CallRingEvent
  | CallTakenEvent
  | CallParticipantsEvent
  | CallSignalEvent
  | CallEndedEvent;
