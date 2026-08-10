import { eq, and, ne, isNull, inArray, desc, gt, sql } from "drizzle-orm";
import type {
  Conversation,
  ConversationSummary,
  ConversationParticipantSummary,
  ChannelListEntry,
  Message,
  MessageAttachment,
  MessageReaction,
  ReadReceipt,
  CallSummary,
} from "@notorious/shared";
import { db } from "../../db/client.js";
import {
  conversations,
  conversationParticipants,
  messages,
  messageAttachments,
  messageReactions,
  messageReadReceipts,
  users,
  workspaces,
  calls,
} from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { badRequest, notFound } from "../../lib/httpError.js";
import { writeUploadedBytes, deleteUploadedSubpath } from "../../lib/storage.js";
import { sendToUserGlobal, broadcastToConversation } from "../realtime/hub.js";
import { notifyUser } from "../push/service.js";
import { isFocused } from "./focusState.js";
import { indexMessage, removeFromIndex } from "./indexer.js";
import path from "node:path";

function toConversation(row: typeof conversations.$inferSelect): Conversation {
  return {
    id: row.id,
    type: row.type,
    workspaceId: row.workspaceId,
    name: row.name,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    lastMessageAt: row.lastMessageAt,
  };
}

function displayNameForDm(others: ConversationParticipantSummary[]): string {
  if (others.length === 0) return "You";
  return others.map((p) => p.name).join(", ");
}

async function latestMessageId(conversationId: string): Promise<string | null> {
  const rows = await db
    .select({ id: messages.id })
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return rows[0]?.id ?? null;
}

/**
 * One query family backing both the desktop floating panel and the mobile
 * full-screen list - channels and DMs merged, sorted by activity. Unread
 * count excludes the caller's own messages and anything after their
 * `lastReadMessageId` cursor (see schema.ts's doc comment on that column).
 */
export async function listUnifiedConversations(userId: string): Promise<ConversationSummary[]> {
  const participantRows = await db
    .select()
    .from(conversationParticipants)
    .where(eq(conversationParticipants.userId, userId));
  if (participantRows.length === 0) return [];

  const conversationIds = participantRows.map((r) => r.conversationId);
  const conversationRows = await db.select().from(conversations).where(inArray(conversations.id, conversationIds));

  const workspaceIds = [...new Set(conversationRows.map((c) => c.workspaceId).filter((id): id is string => id !== null))];
  const workspaceRows = workspaceIds.length
    ? await db.select({ id: workspaces.id, name: workspaces.name, icon: workspaces.icon }).from(workspaces).where(inArray(workspaces.id, workspaceIds))
    : [];
  const workspaceById = new Map(workspaceRows.map((w) => [w.id, w]));

  const allParticipantRows = await db
    .select({
      conversationId: conversationParticipants.conversationId,
      userId: conversationParticipants.userId,
      name: users.name,
      avatarColor: users.avatarColor,
      avatarUrl: users.avatarUrl,
    })
    .from(conversationParticipants)
    .innerJoin(users, eq(conversationParticipants.userId, users.id))
    .where(inArray(conversationParticipants.conversationId, conversationIds));

  const otherParticipantsByConversation = new Map<string, ConversationParticipantSummary[]>();
  for (const row of allParticipantRows) {
    if (row.userId === userId) continue;
    const list = otherParticipantsByConversation.get(row.conversationId) ?? [];
    list.push({ userId: row.userId, name: row.name, avatarColor: row.avatarColor, avatarUrl: row.avatarUrl });
    otherParticipantsByConversation.set(row.conversationId, list);
  }

  const summaries = await Promise.all(
    conversationRows.map(async (conv): Promise<ConversationSummary> => {
      const participant = participantRows.find((p) => p.conversationId === conv.id)!;
      const others = otherParticipantsByConversation.get(conv.id) ?? [];

      const lastMessageRows = await db
        .select({ body: messages.body, deletedAt: messages.deletedAt, createdAt: messages.createdAt, authorName: users.name })
        .from(messages)
        .innerJoin(users, eq(messages.authorId, users.id))
        .where(eq(messages.conversationId, conv.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);
      const lastMessageRow = lastMessageRows[0];

      let cursorCreatedAt: string | null = null;
      if (participant.lastReadMessageId) {
        const cursorRows = await db
          .select({ createdAt: messages.createdAt })
          .from(messages)
          .where(eq(messages.id, participant.lastReadMessageId))
          .limit(1);
        cursorCreatedAt = cursorRows[0]?.createdAt ?? null;
      }

      const unreadWhere = cursorCreatedAt
        ? and(eq(messages.conversationId, conv.id), ne(messages.authorId, userId), isNull(messages.deletedAt), gt(messages.createdAt, cursorCreatedAt))
        : and(eq(messages.conversationId, conv.id), ne(messages.authorId, userId), isNull(messages.deletedAt));
      const unreadRows = await db.select({ count: sql<number>`count(*)` }).from(messages).where(unreadWhere);
      const unreadCount = Number(unreadRows[0]?.count ?? 0);

      return {
        id: conv.id,
        type: conv.type,
        workspaceId: conv.workspaceId,
        workspaceName: conv.workspaceId ? (workspaceById.get(conv.workspaceId)?.name ?? null) : null,
        workspaceIcon: conv.workspaceId ? (workspaceById.get(conv.workspaceId)?.icon ?? null) : null,
        name: conv.type === "workspace_channel" ? (conv.name ?? "Channel") : displayNameForDm(others),
        otherParticipants: others,
        lastMessage: lastMessageRow
          ? { body: lastMessageRow.deletedAt ? null : lastMessageRow.body, authorName: lastMessageRow.authorName, createdAt: lastMessageRow.createdAt }
          : null,
        unreadCount,
        lastMessageAt: conv.lastMessageAt,
      };
    }),
  );

  return summaries.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
}

/** How many conversations in the caller's list have >=1 unread message - drives the PWA app-icon badge (count of conversations, not total messages). */
export async function countUnreadConversations(userId: string): Promise<number> {
  const summaries = await listUnifiedConversations(userId);
  return summaries.filter((c) => c.unreadCount > 0).length;
}

/** Any workspace member, any role - channels are open by design. */
export async function createChannel(workspaceId: string, userId: string, name: string): Promise<Conversation> {
  const id = newId();
  const createdAt = nowIso();
  await db.insert(conversations).values({ id, type: "workspace_channel", workspaceId, name, createdBy: userId, createdAt, lastMessageAt: null });
  await db.insert(conversationParticipants).values({ conversationId: id, userId, joinedAt: createdAt, lastReadMessageId: null });
  return toConversation({ id, type: "workspace_channel", workspaceId, name, createdBy: userId, createdAt, lastMessageAt: null });
}

/** Every channel in the workspace is visible/joinable to every member - "open channels" per the chat feature's requirements. */
export async function listWorkspaceChannels(workspaceId: string, userId: string): Promise<ChannelListEntry[]> {
  const channelRows = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.workspaceId, workspaceId), eq(conversations.type, "workspace_channel")));
  if (channelRows.length === 0) return [];

  const channelIds = channelRows.map((c) => c.id);
  const participantRows = await db
    .select({ conversationId: conversationParticipants.conversationId, userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(inArray(conversationParticipants.conversationId, channelIds));

  return channelRows.map((row) => {
    const members = participantRows.filter((p) => p.conversationId === row.id);
    return {
      conversation: toConversation(row),
      memberCount: members.length,
      joined: members.some((m) => m.userId === userId),
    };
  });
}

/** Self-service join of an open channel - sets the read cursor to whatever the latest message already is, so pre-join history never counts as unread. */
export async function joinChannel(conversationId: string, userId: string): Promise<void> {
  const rows = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
  const conversation = rows[0];
  if (!conversation || conversation.type !== "workspace_channel") throw notFound("Channel not found");

  const existing = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId)))
    .limit(1);
  if (existing[0]) return;

  await db.insert(conversationParticipants).values({
    conversationId,
    userId,
    joinedAt: nowIso(),
    lastReadMessageId: await latestMessageId(conversationId),
  });
}

export async function renameChannel(conversationId: string, name: string): Promise<void> {
  await db.update(conversations).set({ name }).where(eq(conversations.id, conversationId));
}

export async function deleteChannel(conversationId: string): Promise<void> {
  await db.delete(conversations).where(eq(conversations.id, conversationId));
  await deleteUploadedSubpath(path.join("chat", conversationId));
}

/** Self-service, any conversation type. Empty groups/channels tombstone rather than hard-delete, preserving history for anyone re-added later. */
export async function leaveConversation(conversationId: string, userId: string): Promise<void> {
  await db
    .delete(conversationParticipants)
    .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId)));
}

/**
 * Resolves emails to registered users (400 if any is unregistered - no
 * confirmation/friend-request flow, so this is the only gate) and either
 * reuses an existing 1:1 DM with that exact pair, or creates a new
 * conversation (always new for 3+ participants - no group dedup).
 */
export async function findOrCreateDm(userId: string, emails: string[]): Promise<Conversation> {
  const normalizedEmails = [...new Set(emails.map((e) => e.trim().toLowerCase()))];
  const userRows = await db.select().from(users).where(inArray(users.email, normalizedEmails));
  const foundByEmail = new Map(userRows.map((u) => [u.email, u]));
  const missing = normalizedEmails.filter((email) => !foundByEmail.has(email));
  if (missing.length > 0) throw badRequest(`No registered user found for: ${missing.join(", ")}`);

  const otherUserIds = new Set(userRows.map((u) => u.id));
  otherUserIds.delete(userId);
  if (otherUserIds.size === 0) throw badRequest("Add at least one other person");

  const participantIds = [userId, ...otherUserIds];

  if (participantIds.length === 2) {
    const otherUserId = [...otherUserIds][0]!;
    const candidateRows = await db
      .select({ conversationId: conversationParticipants.conversationId })
      .from(conversationParticipants)
      .innerJoin(conversations, eq(conversations.id, conversationParticipants.conversationId))
      .where(and(eq(conversationParticipants.userId, otherUserId), eq(conversations.type, "dm")));

    for (const { conversationId } of candidateRows) {
      const members = await db
        .select({ userId: conversationParticipants.userId })
        .from(conversationParticipants)
        .where(eq(conversationParticipants.conversationId, conversationId));
      if (members.length === 2 && members.some((m) => m.userId === userId)) {
        const rows = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1);
        return toConversation(rows[0]!);
      }
    }
  }

  const id = newId();
  const createdAt = nowIso();
  await db.insert(conversations).values({ id, type: "dm", workspaceId: null, name: null, createdBy: userId, createdAt, lastMessageAt: null });
  await db
    .insert(conversationParticipants)
    .values(participantIds.map((pid) => ({ conversationId: id, userId: pid, joinedAt: createdAt, lastReadMessageId: null })));

  return toConversation({ id, type: "dm", workspaceId: null, name: null, createdBy: userId, createdAt, lastMessageAt: null });
}

async function attachmentsForMessages(messageIds: string[]): Promise<Map<string, MessageAttachment[]>> {
  if (messageIds.length === 0) return new Map();
  const rows = await db.select().from(messageAttachments).where(inArray(messageAttachments.messageId, messageIds));
  const map = new Map<string, MessageAttachment[]>();
  for (const row of rows) {
    const list = map.get(row.messageId!) ?? [];
    list.push({
      id: row.id,
      messageId: row.messageId!,
      filename: row.filename,
      mimeType: row.mimeType,
      size: row.size,
      uploadedBy: row.uploadedBy,
      createdAt: row.createdAt,
    });
    map.set(row.messageId!, list);
  }
  return map;
}

async function reactionsForMessages(messageIds: string[]): Promise<Map<string, MessageReaction[]>> {
  if (messageIds.length === 0) return new Map();
  const rows = await db.select().from(messageReactions).where(inArray(messageReactions.messageId, messageIds));
  const map = new Map<string, MessageReaction[]>();
  for (const row of rows) {
    const list = map.get(row.messageId) ?? [];
    list.push(row);
    map.set(row.messageId, list);
  }
  return map;
}

async function receiptsForMessages(messageIds: string[]): Promise<Map<string, ReadReceipt[]>> {
  if (messageIds.length === 0) return new Map();
  const rows = await db.select().from(messageReadReceipts).where(inArray(messageReadReceipts.messageId, messageIds));
  const map = new Map<string, ReadReceipt[]>();
  for (const row of rows) {
    const list = map.get(row.messageId) ?? [];
    list.push(row);
    map.set(row.messageId, list);
  }
  return map;
}

/** Resolves the inline `CallSummary` for any call-outcome messages in the batch (see calls/service.ts::writeCallHistoryMessage, which sets `messages.callId`) - keyed by message id, not call id, since that's what `toMessage` needs to attach it. */
async function callSummariesForMessages(messages_: (typeof messages.$inferSelect)[]): Promise<Map<string, CallSummary>> {
  const callIds = [...new Set(messages_.map((m) => m.callId).filter((id): id is string => id !== null))];
  if (callIds.length === 0) return new Map();

  const callRows = await db.select().from(calls).where(inArray(calls.id, callIds));
  const callById = new Map(callRows.map((c) => [c.id, c]));

  const map = new Map<string, CallSummary>();
  for (const message of messages_) {
    if (!message.callId) continue;
    const call = callById.get(message.callId);
    if (!call) continue;
    const durationSeconds = call.status === "ended" && call.answeredAt && call.endedAt ? Math.round((Date.parse(call.endedAt) - Date.parse(call.answeredAt)) / 1000) : null;
    map.set(message.id, { callId: call.id, status: call.status, startedAt: call.startedAt, durationSeconds, participantIds: JSON.parse(call.participantIds) as string[] });
  }
  return map;
}

function toMessage(
  row: typeof messages.$inferSelect,
  authorName: string,
  attachments: MessageAttachment[],
  reactions: MessageReaction[],
  readBy: ReadReceipt[] = [],
  call: CallSummary | null = null,
): Message {
  const deleted = Boolean(row.deletedAt);
  return {
    id: row.id,
    conversationId: row.conversationId,
    authorId: row.authorId,
    authorName,
    body: deleted ? null : row.body,
    createdAt: row.createdAt,
    deletedAt: row.deletedAt,
    attachments: deleted ? [] : attachments,
    reactions: deleted ? [] : reactions,
    readBy,
    callId: row.callId,
    call,
  };
}

/** Most-recent-first pagination, `before` is a message id (exclusive cursor). */
export async function listMessages(conversationId: string, before?: string, limit = 50): Promise<Message[]> {
  let beforeCreatedAt: string | undefined;
  if (before) {
    const rows = await db.select({ createdAt: messages.createdAt }).from(messages).where(eq(messages.id, before)).limit(1);
    beforeCreatedAt = rows[0]?.createdAt;
  }

  const whereClause = beforeCreatedAt
    ? and(eq(messages.conversationId, conversationId), sql`${messages.createdAt} < ${beforeCreatedAt}`)
    : eq(messages.conversationId, conversationId);

  const rows = await db
    .select({ message: messages, authorName: users.name })
    .from(messages)
    .innerJoin(users, eq(messages.authorId, users.id))
    .where(whereClause)
    .orderBy(desc(messages.createdAt))
    .limit(limit);

  const messageIds = rows.map((r) => r.message.id);
  const [attachmentsByMessage, reactionsByMessage, receiptsByMessage, callSummaryByMessage] = await Promise.all([
    attachmentsForMessages(messageIds),
    reactionsForMessages(messageIds),
    receiptsForMessages(messageIds),
    callSummariesForMessages(rows.map((r) => r.message)),
  ]);

  return rows
    .map((r) =>
      toMessage(
        r.message,
        r.authorName,
        attachmentsByMessage.get(r.message.id) ?? [],
        reactionsByMessage.get(r.message.id) ?? [],
        receiptsByMessage.get(r.message.id) ?? [],
        callSummaryByMessage.get(r.message.id) ?? null,
      ),
    )
    .reverse();
}

const PREVIEW_LENGTH = 140;

function preview(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, " ");
  return trimmed.length > PREVIEW_LENGTH ? `${trimmed.slice(0, PREVIEW_LENGTH)}…` : trimmed;
}

/**
 * Notifies everyone but the sender: a live WS push to any open `/ws/chat`
 * socket (so every tab updates instantly, including the sender's other
 * tabs - see `broadcastToConversation`), plus a Web Push notification for
 * anyone who doesn't currently have this exact conversation focused on any
 * of their sockets (see chat/focusState.ts) - mirrors
 * `notifications/service.ts::notifyCommentParticipants`'s three-way delivery
 * shape, minus the DB-row/bell part (chat has its own unread-cursor system
 * instead, see markRead).
 */
async function notifyNewMessage(conversationId: string, message: Message, senderName: string, allParticipantUserIds: string[]): Promise<void> {
  broadcastToConversation(allParticipantUserIds, { type: "chatMessage", conversationId, message });

  const recipients = allParticipantUserIds.filter((id) => id !== message.authorId);
  await Promise.all(
    recipients.map(async (userId) => {
      const unreadConversationCount = await countUnreadConversations(userId);
      sendToUserGlobal(userId, { type: "chatUnreadCount", unreadConversationCount });
      if (isFocused(userId, conversationId)) return;
      await notifyUser(userId, {
        type: "chat-message",
        title: senderName,
        body: message.body ? preview(message.body) : "Sent an attachment",
        conversationId,
        url: `/messages/${conversationId}`,
        badge: unreadConversationCount,
      });
    }),
  );
}

/** Inserts the message, then fans it out via realtime + push (see `notifyNewMessage`) - search indexing is wired in separately, see chat/indexer.ts. */
export async function sendMessage(
  conversationId: string,
  userId: string,
  authorName: string,
  input: { body: string; attachmentIds?: string[] },
): Promise<Message> {
  const trimmedBody = input.body.trim();
  const attachmentIds = input.attachmentIds ?? [];
  if (!trimmedBody && attachmentIds.length === 0) throw badRequest("Message cannot be empty");

  const id = newId();
  const createdAt = nowIso();

  await db.insert(messages).values({ id, conversationId, authorId: userId, body: trimmedBody, createdAt, deletedAt: null });
  await db.update(conversations).set({ lastMessageAt: createdAt }).where(eq(conversations.id, conversationId));

  if (attachmentIds.length > 0) {
    await db
      .update(messageAttachments)
      .set({ messageId: id })
      .where(
        and(
          inArray(messageAttachments.id, attachmentIds),
          eq(messageAttachments.conversationId, conversationId),
          eq(messageAttachments.uploadedBy, userId),
          isNull(messageAttachments.messageId),
        ),
      );
  }

  const attachmentsByMessage = await attachmentsForMessages([id]);

  const participantRows = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, conversationId));

  const allParticipantUserIds = participantRows.map((p) => p.userId);
  const message = toMessage(
    { id, conversationId, authorId: userId, body: trimmedBody, createdAt, deletedAt: null, callId: null },
    authorName,
    attachmentsByMessage.get(id) ?? [],
    [],
  );

  await notifyNewMessage(conversationId, message, authorName, allParticipantUserIds);
  indexMessage(id, trimmedBody);

  return message;
}

export async function getParticipantUserIds(conversationId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: conversationParticipants.userId })
    .from(conversationParticipants)
    .where(eq(conversationParticipants.conversationId, conversationId));
  return rows.map((r) => r.userId);
}

export async function getMessageConversationId(messageId: string): Promise<string> {
  const rows = await db.select({ conversationId: messages.conversationId }).from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!rows[0]) throw notFound("Message not found");
  return rows[0].conversationId;
}

/** Own messages only. */
export async function softDeleteMessage(messageId: string, userId: string): Promise<void> {
  const rows = await db.select().from(messages).where(eq(messages.id, messageId)).limit(1);
  const message = rows[0];
  if (!message) throw notFound("Message not found");
  if (message.authorId !== userId) throw badRequest("You can only delete your own messages");

  await db.update(messages).set({ deletedAt: nowIso() }).where(eq(messages.id, messageId));
  removeFromIndex(messageId);

  const participantUserIds = await getParticipantUserIds(message.conversationId);
  broadcastToConversation(participantUserIds, { type: "chatMessageDeleted", conversationId: message.conversationId, messageId });
}

/**
 * Push-notifies the message's author when someone else reacts to it -
 * mirrors `notifyNewMessage`'s Web Push half (no DB-row/bell), skipped if
 * the reactor is the author themselves or the author already has this
 * conversation focused (see focusState.ts). Unlike a new message, a
 * reaction isn't "unread" the way a message is, so there's no badge count
 * and no unread-cursor bump here.
 */
async function notifyReaction(messageId: string, conversationId: string, reactorId: string, reactorName: string, emoji: string): Promise<void> {
  const rows = await db.select({ authorId: messages.authorId, body: messages.body }).from(messages).where(eq(messages.id, messageId)).limit(1);
  const message = rows[0];
  if (!message || message.authorId === reactorId) return;
  if (isFocused(message.authorId, conversationId)) return;

  await notifyUser(message.authorId, {
    type: "chat-reaction",
    title: reactorName,
    body: `reacted ${emoji} to ${message.body ? `"${preview(message.body)}"` : "your message"}`,
    conversationId,
    url: `/messages/${conversationId}`,
  });
}

export async function react(messageId: string, userId: string, reactorName: string, emoji: string): Promise<MessageReaction[]> {
  await db
    .insert(messageReactions)
    .values({ messageId, userId, emoji, createdAt: nowIso() })
    .onConflictDoNothing();
  const reactions = await db.select().from(messageReactions).where(eq(messageReactions.messageId, messageId));

  const conversationId = await getMessageConversationId(messageId);
  const participantUserIds = await getParticipantUserIds(conversationId);
  broadcastToConversation(participantUserIds, { type: "chatReaction", conversationId, messageId, reactions });
  await notifyReaction(messageId, conversationId, userId, reactorName, emoji);

  return reactions;
}

export async function unreact(messageId: string, userId: string, emoji: string): Promise<MessageReaction[]> {
  await db
    .delete(messageReactions)
    .where(and(eq(messageReactions.messageId, messageId), eq(messageReactions.userId, userId), eq(messageReactions.emoji, emoji)));
  const reactions = await db.select().from(messageReactions).where(eq(messageReactions.messageId, messageId));

  const conversationId = await getMessageConversationId(messageId);
  const participantUserIds = await getParticipantUserIds(conversationId);
  broadcastToConversation(participantUserIds, { type: "chatReaction", conversationId, messageId, reactions });

  return reactions;
}

/** Bumps the cursor and writes per-message receipts for everything between the old cursor and `upToMessageId` - see schema.ts's doc comment on why both exist. Also re-broadcasts the caller's own updated unread-conversation count to their own sockets, so the badge/other tabs stay in sync (see chat/service.ts::countUnreadConversations). */
export async function markRead(conversationId: string, userId: string, upToMessageId: string): Promise<string[]> {
  const targetRows = await db.select({ createdAt: messages.createdAt }).from(messages).where(eq(messages.id, upToMessageId)).limit(1);
  const targetCreatedAt = targetRows[0]?.createdAt;
  if (!targetCreatedAt) throw notFound("Message not found");

  const participantRows = await db
    .select({ lastReadMessageId: conversationParticipants.lastReadMessageId })
    .from(conversationParticipants)
    .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId)))
    .limit(1);
  let sinceCreatedAt: string | null = null;
  const previousCursor = participantRows[0]?.lastReadMessageId;
  if (previousCursor) {
    const rows = await db.select({ createdAt: messages.createdAt }).from(messages).where(eq(messages.id, previousCursor)).limit(1);
    sinceCreatedAt = rows[0]?.createdAt ?? null;
  }

  const newlyReadWhere = sinceCreatedAt
    ? and(eq(messages.conversationId, conversationId), sql`${messages.createdAt} > ${sinceCreatedAt}`, sql`${messages.createdAt} <= ${targetCreatedAt}`)
    : and(eq(messages.conversationId, conversationId), sql`${messages.createdAt} <= ${targetCreatedAt}`);
  const newlyReadRows = await db.select({ id: messages.id }).from(messages).where(newlyReadWhere);

  const readAt = nowIso();
  if (newlyReadRows.length > 0) {
    await db
      .insert(messageReadReceipts)
      .values(newlyReadRows.map((m) => ({ messageId: m.id, userId, readAt })))
      .onConflictDoNothing();
  }

  await db
    .update(conversationParticipants)
    .set({ lastReadMessageId: upToMessageId })
    .where(and(eq(conversationParticipants.conversationId, conversationId), eq(conversationParticipants.userId, userId)));

  const readMessageIds = newlyReadRows.map((m) => m.id);
  if (readMessageIds.length > 0) {
    const receipts = readMessageIds.map((messageId) => ({ messageId, userId, readAt }));
    const participantUserIds = await getParticipantUserIds(conversationId);
    broadcastToConversation(participantUserIds, { type: "chatReadReceipt", conversationId, receipts });
  }

  sendToUserGlobal(userId, { type: "chatUnreadCount", unreadConversationCount: await countUnreadConversations(userId) });

  return readMessageIds;
}

/**
 * Uploaded before the message it'll belong to exists (see `sendMessage`'s
 * `attachmentIds` linking step) - stored under `chat/<conversationId>/`
 * instead of `<workspaceId>/...` (see lib/storage.ts's doc comment) since a
 * DM has no workspace to scope by.
 */
export async function saveChatAttachment(input: {
  conversationId: string;
  uploadedBy: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
}): Promise<MessageAttachment> {
  const { id, storagePath } = await writeUploadedBytes(path.join("chat", input.conversationId), input.filename, input.buffer);
  const createdAt = nowIso();

  await db.insert(messageAttachments).values({
    id,
    conversationId: input.conversationId,
    messageId: null,
    filename: input.filename,
    mimeType: input.mimeType,
    size: input.buffer.length,
    storagePath,
    uploadedBy: input.uploadedBy,
    createdAt,
  });

  return { id, messageId: "", filename: input.filename, mimeType: input.mimeType, size: input.buffer.length, uploadedBy: input.uploadedBy, createdAt };
}

export async function getChatAttachment(id: string): Promise<{ row: typeof messageAttachments.$inferSelect }> {
  const rows = await db.select().from(messageAttachments).where(eq(messageAttachments.id, id)).limit(1);
  if (!rows[0]) throw notFound("Attachment not found");
  return { row: rows[0] };
}

export { toConversation, toMessage };
