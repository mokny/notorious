import type { ISODateString } from "./entities.js";

/** A minimal, denormalized participant summary - enough to render an avatar/name without a separate lookup. */
export interface ConversationParticipantSummary {
  userId: string;
  name: string;
  avatarColor: string;
  avatarUrl?: string | null;
}

/**
 * A chat conversation - either a `workspace_channel` (bound to one
 * workspace, open/joinable by any member) or a `dm` (workspace-agnostic,
 * 1:1 or free-form group of registered users, no confirmation flow). See
 * modules/chat/service.ts.
 */
export interface Conversation {
  id: string;
  type: "workspace_channel" | "dm";
  /** Set only for `workspace_channel`. */
  workspaceId: string | null;
  /** Set only for `workspace_channel` - DMs compute a display name client-side from participants. */
  name: string | null;
  createdBy: string;
  createdAt: ISODateString;
  lastMessageAt: ISODateString | null;
}

export interface ConversationParticipant {
  conversationId: string;
  userId: string;
  joinedAt: ISODateString;
  lastReadMessageId: string | null;
}

export interface MessageAttachment {
  id: string;
  messageId: string;
  filename: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  createdAt: ISODateString;
}

export interface MessageReaction {
  messageId: string;
  userId: string;
  emoji: string;
  createdAt: ISODateString;
}

export interface ReadReceipt {
  messageId: string;
  userId: string;
  readAt: ISODateString;
}

export interface Message {
  id: string;
  conversationId: string;
  authorId: string;
  authorName: string;
  /** Null once soft-deleted - see `deletedAt`. */
  body: string | null;
  createdAt: ISODateString;
  deletedAt: ISODateString | null;
  attachments: MessageAttachment[];
  reactions: MessageReaction[];
  /** Who has read this message and when - see message_read_receipts / chat/service.ts::markRead. */
  readBy: ReadReceipt[];
}

/**
 * One row in the unified conversation list (desktop floating panel + mobile
 * full-screen list) - computed entirely server-side by
 * `chat/service.ts::listUnifiedConversations` so both surfaces just render
 * this directly instead of re-deriving DM display names/unread state
 * client-side.
 */
export interface ConversationSummary {
  id: string;
  type: "workspace_channel" | "dm";
  workspaceId: string | null;
  workspaceName: string | null;
  /** Lucide icon name (see components/ui/Icon.tsx) - null for a `dm`. */
  workspaceIcon: string | null;
  /** Channel name for `workspace_channel`; for `dm`, a display name computed from `otherParticipants`. */
  name: string;
  otherParticipants: ConversationParticipantSummary[];
  lastMessage: { body: string | null; authorName: string; createdAt: ISODateString } | null;
  unreadCount: number;
  lastMessageAt: ISODateString | null;
}

/** One row in a workspace's browsable channel list (see chat/service.ts::listWorkspaceChannels) - every channel is visible/joinable to every member, `joined` says whether this caller already is. */
export interface ChannelListEntry {
  conversation: Conversation;
  memberCount: number;
  joined: boolean;
}

/** One row in a chat message search result (see search/service.ts::searchMessages) - deep-links into the conversation rather than an object detail page. */
export interface MessageSearchResult {
  conversationId: string;
  conversationName: string;
  messageId: string;
  body: string;
  authorName: string;
  createdAt: ISODateString;
}
