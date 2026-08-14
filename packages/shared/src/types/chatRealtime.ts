import type { Message, MessageReaction, ReadReceipt } from "./chat.js";
import type { MediaKind, ProducerSource } from "./media.js";
import type { ChatStatus } from "./entities.js";

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
 * every current call participant whenever someone joins or leaves - under
 * the SFU model this is purely informational/for roster pruning (see
 * CallContext.tsx), unlike the old mesh where it also told existing
 * participants they had to initiate a fresh offer to a newcomer. That rule
 * doesn't exist anymore: every relationship is client<->server, so a
 * newcomer's own tracks are announced via `mediaNewProducer` below, not by
 * this event.
 */
export interface CallParticipantsEvent {
  type: "callParticipants";
  callId: string;
  conversationId: string;
  participants: { userId: string; clientId: string }[];
}

/**
 * Sent to every OTHER current participant of a call when someone's send
 * transport successfully produces a new track (mic/camera/screen) - the SFU
 * replacement for the old mesh's ontrack/renegotiation dance (see
 * chat/calls/sfu.ts). Tells the client to call `POST .../consume` for this
 * producerId.
 */
export interface CallMediaNewProducerEvent {
  type: "mediaNewProducer";
  callId: string;
  producerId: string;
  userId: string;
  clientId: string;
  kind: MediaKind;
  source: ProducerSource;
}

/** Sent when a producer stops (explicit toggle-off, or the participant left the call entirely) - tells the client to tear down its local Consumer/track for this producerId. */
export interface CallMediaProducerClosedEvent {
  type: "mediaProducerClosed";
  callId: string;
  producerId: string;
}

/** The call ended (last participant left, or it was declined/missed before anyone joined) - conversationId lets `getActiveCall` state clear even for a client that isn't currently in the call. */
export interface CallEndedEvent {
  type: "callEnded";
  callId: string;
  conversationId: string;
  reason: "hangup" | "declined" | "missed";
}

/**
 * Sent to exactly the device(s) connected under one specific login session
 * when that session is revoked from Settings > Security's device list (see
 * `sendToSession` in realtime/hub.ts, plugins/session.ts's `revokeSession`)
 * - tells that device its session is gone right now, rather than it only
 * finding out on its next REST call. Carries no payload beyond the type: the
 * client doesn't need to know *which* session was revoked, only that its own
 * was (it never learns its own session id in the first place - the cookie is
 * httpOnly).
 */
export interface SessionRevokedEvent {
  type: "sessionRevoked";
}

/** Sent to every one of a user's open tabs/devices when they change an account setting (currently just content font size) in Settings - see modules/auth/service.ts's `updateContentFontSize`. Carries no payload: the client just refetches `["me"]`, same as `sessionRevoked`. */
export interface UserSettingsUpdatedEvent {
  type: "userSettingsUpdated";
}

/** Sent to a user's own other devices plus every one of their chat contacts (see modules/chat/service.ts's `getChatContactUserIds`) when they change their chat status in the sidebar avatar menu, OR when their online/offline state flips (see `modules/realtime/hub.ts`'s `onUserOnlineChange`) - lets any already-rendered `ChatAvatar`/`PresenceViewer` status dot update live instead of waiting for a refetch. `online: false` overrides `status` to gray client-side regardless of its value - see `ChatAvatar.tsx`. */
export interface UserStatusChangedEvent {
  type: "userStatusChanged";
  userId: string;
  status: ChatStatus;
  online: boolean;
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
  | CallMediaNewProducerEvent
  | CallMediaProducerClosedEvent
  | CallEndedEvent
  | SessionRevokedEvent
  | UserSettingsUpdatedEvent
  | UserStatusChangedEvent;
