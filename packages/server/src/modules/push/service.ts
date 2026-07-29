import webpush from "web-push";
import { eq } from "drizzle-orm";
import type { PushSubscribeInput } from "@notorious/shared";
import { db } from "../../db/client.js";
import { pushSubscriptions } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { env } from "../../env.js";

let configured = false;

function ensureConfigured(): boolean {
  if (!env.vapidPublicKey || !env.vapidPrivateKey) return false;
  if (!configured) {
    webpush.setVapidDetails(env.vapidSubject, env.vapidPublicKey, env.vapidPrivateKey);
    configured = true;
  }
  return true;
}

export async function subscribe(userId: string, input: PushSubscribeInput): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({
      id: newId(),
      userId,
      endpoint: input.endpoint,
      p256dh: input.keys.p256dh,
      auth: input.keys.auth,
      createdAt: nowIso(),
    })
    .onConflictDoNothing();
}

export async function unsubscribe(endpoint: string): Promise<void> {
  await db.delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

/** Sends a push notification to every device the user has subscribed from. */
export async function notifyUser(userId: string, payload: { title: string; body: string; url?: string }): Promise<void> {
  if (!ensureConfigured()) return;

  const subscriptions = await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.userId, userId));
  const body = JSON.stringify(payload);

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          body,
        );
      } catch (error: unknown) {
        const statusCode = (error as { statusCode?: number }).statusCode;
        if (statusCode === 404 || statusCode === 410) {
          await db.delete(pushSubscriptions).where(eq(pushSubscriptions.id, sub.id));
        }
      }
    }),
  );
}
