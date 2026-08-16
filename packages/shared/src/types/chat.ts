import type { ISODateString, ChatStatus } from "./entities.js";
import type { CallSummary } from "./calls.js";

/** A minimal, denormalized participant summary - enough to render an avatar/name without a separate lookup. */
export interface ConversationParticipantSummary {
  userId: string;
  name: string;
  avatarColor: string;
  avatarUrl?: string | null;
  chatStatus: ChatStatus;
  /** Whether this participant currently has at least one open `/ws/chat` socket - see `modules/realtime/hub.ts`'s `isUserOnline`. `false` overrides `chatStatus` to a gray dot client-side (see `ChatAvatar.tsx`), since a manually-set status conveys nothing about a user who isn't around to see the message live. */
  online: boolean;
  /** When this participant's last `/ws/chat` socket closed - null if they've never disconnected (e.g. never logged in, or the process was restarted before their first disconnect). Only meaningful while `online` is false; see `ThreadView.tsx`'s "last seen" line. */
  lastSeenAt: ISODateString | null;
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

/**
 * The quoted-message snippet shown above a reply, in `MessageBubble.tsx` and
 * the composer's reply preview. Deliberately not a full `Message` - avoids
 * unbounded nesting (a reply to a reply to a reply...) since a quote only
 * ever needs to render one line of context, never its own quote.
 */
export interface MessageReplyPreview {
  id: string;
  authorName: string;
  /** Null if the original was soft-deleted or attachment-only - renderers fall back to "Message deleted"/"Attachment" text. */
  body: string | null;
  deleted: boolean;
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
  /** Set only for a call-outcome system row (see calls.ts's CallSummary) - MessageBubble renders these as a compact call-log row instead of a normal bubble. Null for every ordinary message. */
  callId: string | null;
  call: CallSummary | null;
  /** Set when this message was sent as a reply - see `replyTo` for the quoted content. */
  replyToId: string | null;
  replyTo: MessageReplyPreview | null;
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
