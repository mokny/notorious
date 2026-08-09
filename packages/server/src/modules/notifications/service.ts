import { eq, and, desc, isNull } from "drizzle-orm";
import type { Notification } from "@notorious/shared";
import { db } from "../../db/client.js";
import { notifications, comments, workspaces } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { notFound } from "../../lib/httpError.js";
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
    actorName: row.actorName,
    body: row.body,
    createdAt: row.createdAt,
    readAt: row.readAt,
  };
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
        actorName: input.actorName,
        body,
        createdAt,
        readAt: null,
      };
      sendToUser(input.workspaceId, userId, { type: "notification", workspaceId: input.workspaceId, notification });

      await notifyUser(userId, {
        type: "mention",
        title: `${input.actorName} commented on "${input.objectTitle}"`,
        body,
        url: `/w/${input.workspaceId}/objects/${input.objectId}`,
      });
    }),
  );
}
