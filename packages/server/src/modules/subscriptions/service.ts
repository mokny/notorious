import { eq, and, lte } from "drizzle-orm";
import { db } from "../../db/client.js";
import { objectSubscriptions, pendingSubscriptionNotifications, notifications, objects, users } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { translate } from "../../lib/i18n.js";
import { notifyUser } from "../push/service.js";
import { sendToUser } from "../realtime/hub.js";
import type { Notification } from "@notorious/shared";

/** How long an object's activity has to go quiet before a bundled notification is delivered to its subscribers - see modules/subscriptions/scheduler.ts. */
const DEBOUNCE_MS = 5 * 60 * 1000;

export async function isSubscribed(objectId: string, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: objectSubscriptions.id })
    .from(objectSubscriptions)
    .where(and(eq(objectSubscriptions.objectId, objectId), eq(objectSubscriptions.userId, userId)))
    .limit(1);
  return rows.length > 0;
}

export async function subscribe(workspaceId: string, objectId: string, userId: string): Promise<void> {
  await db
    .insert(objectSubscriptions)
    .values({ id: newId(), workspaceId, objectId, userId, createdAt: nowIso() })
    .onConflictDoNothing();
}

export async function unsubscribe(objectId: string, userId: string): Promise<void> {
  await db.delete(objectSubscriptions).where(and(eq(objectSubscriptions.objectId, objectId), eq(objectSubscriptions.userId, userId)));
}

/**
 * Called from realtime/activity.ts's `recordAndBroadcast` for every change
 * that touches an object - upserts a pending, debounced notification for
 * each of the object's subscribers (excluding whoever just made the change).
 * A burst of edits within `DEBOUNCE_MS` of each other collapses into the one
 * row's `changeCount`/`dueAt`, delivered once as a single notification by
 * the scheduler once the object goes quiet - see that module's own comment
 * for why this is a DB-backed queue rather than an in-memory timer.
 */
export async function enqueueSubscriberNotifications(workspaceId: string, objectId: string, actorId: string): Promise<void> {
  const subscribers = await db
    .select({ userId: objectSubscriptions.userId })
    .from(objectSubscriptions)
    .where(eq(objectSubscriptions.objectId, objectId));
  const recipients = subscribers.map((row) => row.userId).filter((id) => id !== actorId);
  if (recipients.length === 0) return;

  const dueAt = new Date(Date.now() + DEBOUNCE_MS).toISOString();
  const createdAt = nowIso();

  await Promise.all(
    recipients.map(async (userId) => {
      const existing = await db
        .select({ id: pendingSubscriptionNotifications.id, changeCount: pendingSubscriptionNotifications.changeCount })
        .from(pendingSubscriptionNotifications)
        .where(and(eq(pendingSubscriptionNotifications.objectId, objectId), eq(pendingSubscriptionNotifications.userId, userId)))
        .limit(1);

      if (existing[0]) {
        await db
          .update(pendingSubscriptionNotifications)
          .set({ lastActorId: actorId, changeCount: existing[0].changeCount + 1, dueAt })
          .where(eq(pendingSubscriptionNotifications.id, existing[0].id));
      } else {
        await db.insert(pendingSubscriptionNotifications).values({
          id: newId(),
          workspaceId,
          objectId,
          userId,
          lastActorId: actorId,
          changeCount: 1,
          dueAt,
          createdAt,
        });
      }
    }),
  );
}

/** Finds every pending bundle whose debounce window has elapsed - called once a minute by the scheduler. */
export async function findDueSubscriptionNotifications(): Promise<(typeof pendingSubscriptionNotifications.$inferSelect)[]> {
  return db.select().from(pendingSubscriptionNotifications).where(lte(pendingSubscriptionNotifications.dueAt, nowIso()));
}

/**
 * Delivers one due bundle the same three ways `notifyCommentParticipants`
 * does (DB row, live WS push, Web Push) and clears the pending row. A no-op
 * if the object was deleted/archived-away or the actor's account is gone by
 * the time this fires - the pending row is still removed either way so it
 * doesn't retry forever.
 */
export async function deliverPendingSubscriptionNotification(pending: typeof pendingSubscriptionNotifications.$inferSelect): Promise<void> {
  const [object] = await db.select({ title: objects.title }).from(objects).where(eq(objects.id, pending.objectId)).limit(1);
  const [actor] = await db.select({ name: users.name }).from(users).where(eq(users.id, pending.lastActorId)).limit(1);

  if (!object || !actor) {
    await db.delete(pendingSubscriptionNotifications).where(eq(pendingSubscriptionNotifications.id, pending.id));
    return;
  }

  const [recipient] = await db.select({ locale: users.locale }).from(users).where(eq(users.id, pending.userId)).limit(1);
  const titleKey = pending.changeCount > 1 ? "push.objectUpdate.titleMultiple" : "push.objectUpdate.title";
  const title = await translate(recipient?.locale ?? null, titleKey, { actor: actor.name, title: object.title, count: pending.changeCount });

  const id = newId();
  const createdAt = nowIso();
  await db.insert(notifications).values({
    id,
    userId: pending.userId,
    workspaceId: pending.workspaceId,
    objectId: pending.objectId,
    objectTitle: object.title,
    commentId: null,
    source: "subscription",
    blockId: null,
    fieldKey: null,
    actorName: actor.name,
    body: title,
    createdAt,
  });

  const notification: Notification = {
    id,
    userId: pending.userId,
    workspaceId: pending.workspaceId,
    objectId: pending.objectId,
    objectTitle: object.title,
    commentId: null,
    source: "subscription",
    blockId: null,
    fieldKey: null,
    actorName: actor.name,
    body: title,
    createdAt,
    readAt: null,
  };
  sendToUser(pending.workspaceId, pending.userId, { type: "notification", workspaceId: pending.workspaceId, notification });

  await notifyUser(pending.userId, {
    type: "object-update",
    title,
    body: object.title,
    url: `/w/${pending.workspaceId}/objects/${pending.objectId}`,
  });

  await db.delete(pendingSubscriptionNotifications).where(eq(pendingSubscriptionNotifications.id, pending.id));
}
