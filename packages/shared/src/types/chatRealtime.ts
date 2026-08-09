import type { Message, MessageReaction, ReadReceipt } from "./chat.js";

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

export type ChatRealtimeMessage =
  | ChatMessageEvent
  | ChatMessageDeletedEvent
  | ChatReactionEvent
  | ChatReadReceiptEvent
  | ChatTypingEvent
  | ChatConversationEvent
  | ChatUnreadCountEvent;
