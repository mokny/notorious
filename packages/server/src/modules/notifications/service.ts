import { eq, and, desc, isNull, inArray, sql } from "drizzle-orm";
import type { Notification } from "@notorious/shared";
import { diffNewMentionedUserIds, MENTION_PATTERN } from "@notorious/shared";
import { db } from "../../db/client.js";
import { notifications, comments, workspaces, users, workspaceMembers } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { notFound } from "../../lib/httpError.js";
import { translate } from "../../lib/i18n.js";
import { notifyUser } from "../push/service.js";
import { sendToUser } from "../realtime/hub.js";

function toNotification(row: typeof notifications.$inferSelect): Notification {
  return {
    id: row.id,
    userId: row.userId,
    workspaceId: row.workspaceId,
    objectId: row.objectId,
    objectTitle: row.objectTitle,
    commentId: row.commentId,
    source: row.source as Notification["source"],
    blockId: row.blockId,
    fieldKey: row.fieldKey,
    actorName: row.actorName,
    body: row.body,
    createdAt: row.createdAt,
    readAt: row.readAt,
  };
}

/** Strips `@[Display Name|userId]` mention syntax down to plain `@Display Name` - used for the human-readable bell/push preview, since the raw mention syntax isn't meant to be read directly. Reuses the shared pattern (see utils/mentions.ts) rather than a local copy so the two can't drift apart. */
function stripMentionSyntax(text: string): string {
  return text.replace(MENTION_PATTERN, "@$1");
}

const PREVIEW_LENGTH = 140;

function preview(body: string): string {
  const trimmed = body.trim().replace(/\s+/g, " ");
  return trimmed.length > PREVIEW_LENGTH ? `${trimmed.slice(0, PREVIEW_LENGTH)}…` : trimmed;
}

/** Most-recent-first, capped at 50 - a bell dropdown, not a full archive. */
export async function listNotifications(userId: string, workspaceId: string): Promise<Notification[]> {
  const rows = await db
    .select()
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.workspaceId, workspaceId)))
    .orderBy(desc(notifications.createdAt))
    .limit(50);
  return rows.map(toNotification);
}

/** Same filter as `listNotifications`, but a bare count for badges (rail icons, WorkspacePickerPage) that don't need the actual rows. */
export async function countUnreadNotifications(userId: string, workspaceId: string): Promise<number> {
  const rows = await db
    .select({ count: sql<number>`count(*)` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), eq(notifications.workspaceId, workspaceId), isNull(notifications.readAt)));
  return Number(rows[0]?.count ?? 0);
}

export async function markNotificationRead(id: string, userId: string): Promise<void> {
  // Scoped to `userId` too, not just `id` - so one user can't mark (or even
  // discover, via a distinguishable 404 vs no-op) another user's
  // notification as read.
  const rows = await db
    .select({ id: notifications.id })
    .from(notifications)
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .limit(1);
  if (!rows[0]) throw notFound("Notification not found");
  await db.update(notifications).set({ readAt: nowIso() }).where(eq(notifications.id, id));
}

export async function markAllNotificationsRead(userId: string, workspaceId: string): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: nowIso() })
    .where(and(eq(notifications.userId, userId), eq(notifications.workspaceId, workspaceId), isNull(notifications.readAt)));
}

/**
 * Notifies the object's owner plus everyone who has previously commented on
 * it (excluding whoever just posted this comment) - a "thread follower"
 * model: you're notified once you're part of the conversation, not for
 * every comment in the workspace. Delivered three ways at once: a DB row
 * (source of truth, shown in the bell's dropdown), a live WS push to any
 * open tab (see `sendToUser`), and a Web Push notification (see
 * modules/push/service.ts) for when no tab is open at all. Anonymous
 * share-link visitors are never recipients - `comments.authorId`/the
 * workspace owner are always real user ids (see workspaces/access.ts's
 * `resolveActor`), and only registered users have a bell/push subscription
 * to deliver to in the first place.
 */
export async function notifyCommentParticipants(input: {
  workspaceId: string;
  objectId: string;
  objectTitle: string;
  commentId: string;
  actorId: string;
  actorName: string;
  body: string;
}): Promise<void> {
  const ownerRows = await db
    .select({ ownerId: workspaces.ownerId })
    .from(workspaces)
    .where(eq(workspaces.id, input.workspaceId))
    .limit(1);
  const previousCommenters = await db
    .selectDistinct({ authorId: comments.authorId })
    .from(comments)
    .where(eq(comments.objectId, input.objectId));

  const recipients = new Set<string>();
  if (ownerRows[0]?.ownerId) recipients.add(ownerRows[0].ownerId);
  for (const row of previousCommenters) {
    if (row.authorId) recipients.add(row.authorId);
  }
  recipients.delete(input.actorId);

  const body = preview(input.body);
  const createdAt = nowIso();

  await Promise.all(
    [...recipients].map(async (userId) => {
      const id = newId();
      await db.insert(notifications).values({
        id,
        userId,
        workspaceId: input.workspaceId,
        objectId: input.objectId,
        objectTitle: input.objectTitle,
        commentId: input.commentId,
        actorName: input.actorName,
        body,
        createdAt,
      });

      const notification: Notification = {
        id,
        userId,
        workspaceId: input.workspaceId,
        objectId: input.objectId,
        objectTitle: input.objectTitle,
        commentId: input.commentId,
        source: "comment",
        blockId: null,
        fieldKey: null,
        actorName: input.actorName,
        body,
        createdAt,
        readAt: null,
      };
      sendToUser(input.workspaceId, userId, { type: "notification", workspaceId: input.workspaceId, notification });

      const [recipient] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1);
      await notifyUser(userId, {
        type: "comment-reply",
        title: await translate(recipient?.locale ?? null, "push.commentReply.title", { actor: input.actorName, title: input.objectTitle }),
        body,
        url: `/w/${input.workspaceId}/objects/${input.objectId}`,
      });
    }),
  );
}

/**
 * Notifies every workspace member newly @mentioned (`@[Name](user:id)`,
 * see utils/mentions.ts) between `previousText` and `nextText` - a comment
 * body, a block's markdown, or a text/long-text property value. Diff-based
 * (`diffNewMentionedUserIds`) so re-saving content that still contains an
 * already-notified mention doesn't notify that user again. Delivered the
 * same three ways as `notifyCommentParticipants`: a DB row, a live WS push,
 * and a Web Push. Never notifies the mentioner about their own mention, and
 * only ever notifies actual workspace members - the mention text is free-form
 * and could reference a stale or tampered user id that's no longer (or never
 * was) a member.
 */
export async function notifyMentionedUsers(input: {
  workspaceId: string;
  objectId: string;
  objectTitle: string;
  actorId: string;
  actorName: string;
  source: "mention-comment" | "mention-block" | "mention-field";
  previousText: string;
  nextText: string;
  commentId?: string;
  blockId?: string;
  fieldKey?: string;
}): Promise<void> {
  const mentionedIds = diffNewMentionedUserIds(input.previousText, input.nextText).filter((id) => id !== input.actorId);
  if (mentionedIds.length === 0) return;

  const memberRows = await db
    .select({ userId: workspaceMembers.userId })
    .from(workspaceMembers)
    .where(and(eq(workspaceMembers.workspaceId, input.workspaceId), inArray(workspaceMembers.userId, mentionedIds)));
  const recipients = memberRows.map((row) => row.userId);
  if (recipients.length === 0) return;

  const commentId = input.commentId ?? null;
  const blockId = input.blockId ?? null;
  const fieldKey = input.fieldKey ?? null;
  const body = preview(stripMentionSyntax(input.nextText));
  const createdAt = nowIso();

  const url = (() => {
    if (input.source === "mention-comment") return `/w/${input.workspaceId}/objects/${input.objectId}?comment=${commentId}`;
    if (input.source === "mention-block") return `/w/${input.workspaceId}/objects/${input.objectId}?block=${blockId}`;
    return `/w/${input.workspaceId}/objects/${input.objectId}?field=${fieldKey}`;
  })();

  await Promise.all(
    recipients.map(async (userId) => {
      const id = newId();
      await db.insert(notifications).values({
        id,
        userId,
        workspaceId: input.workspaceId,
        objectId: input.objectId,
        objectTitle: input.objectTitle,
        commentId,
        source: input.source,
        blockId,
        fieldKey,
        actorName: input.actorName,
        body,
        createdAt,
      });

      const notification: Notification = {
        id,
        userId,
        workspaceId: input.workspaceId,
        objectId: input.objectId,
        objectTitle: input.objectTitle,
        commentId,
        source: input.source,
        blockId,
        fieldKey,
        actorName: input.actorName,
        body,
        createdAt,
        readAt: null,
      };
      sendToUser(input.workspaceId, userId, { type: "notification", workspaceId: input.workspaceId, notification });

      const [recipient] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, userId)).limit(1);
      await notifyUser(userId, {
        type: "mention",
        title: await translate(recipient?.locale ?? null, "push.mention.title", { actor: input.actorName, title: input.objectTitle }),
        body,
        url,
      });
    }),
  );
}
