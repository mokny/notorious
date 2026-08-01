import { createHmac, randomBytes } from "node:crypto";
import { eq, and } from "drizzle-orm";
import type { Webhook, CreatedWebhook, CreateWebhookInput, UpdateWebhookInput, WebhookEvent, WebhookPayload } from "@notorious/shared";
import { db } from "../../db/client.js";
import { webhooks, objectTypes, workspaces, users } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { notFound } from "../../lib/httpError.js";
import { encrypt, decrypt } from "../../lib/crypto.js";
import { getObject } from "../objects/service.js";

const DELIVERY_TIMEOUT_MS = 10_000;

function toWebhook(row: typeof webhooks.$inferSelect): Webhook {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    url: row.url,
    events: JSON.parse(row.events) as WebhookEvent[],
    enabled: row.enabled,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    lastTriggeredAt: row.lastTriggeredAt,
    lastStatus: row.lastStatus,
    lastError: row.lastError,
  };
}

/** The plaintext signing secret is returned only this once - see CreatedWebhook's own doc comment. */
export async function createWebhook(workspaceId: string, createdBy: string, input: CreateWebhookInput): Promise<CreatedWebhook> {
  const id = newId();
  const secret = randomBytes(24).toString("hex");
  const createdAt = nowIso();

  await db.insert(webhooks).values({
    id,
    workspaceId,
    url: input.url,
    secret: encrypt(secret),
    events: JSON.stringify(input.events),
    enabled: true,
    createdBy,
    createdAt,
    lastTriggeredAt: null,
    lastStatus: null,
    lastError: null,
  });

  return {
    id,
    workspaceId,
    url: input.url,
    events: input.events,
    enabled: true,
    createdBy,
    createdAt,
    lastTriggeredAt: null,
    lastStatus: null,
    lastError: null,
    secret,
  };
}

export async function listWebhooks(workspaceId: string): Promise<Webhook[]> {
  const rows = await db.select().from(webhooks).where(eq(webhooks.workspaceId, workspaceId));
  return rows.map(toWebhook);
}

async function getWebhookRow(workspaceId: string, id: string): Promise<typeof webhooks.$inferSelect> {
  const rows = await db
    .select()
    .from(webhooks)
    .where(and(eq(webhooks.id, id), eq(webhooks.workspaceId, workspaceId)))
    .limit(1);
  if (!rows[0]) throw notFound("Webhook not found");
  return rows[0];
}

export async function updateWebhook(workspaceId: string, id: string, input: UpdateWebhookInput): Promise<Webhook> {
  await getWebhookRow(workspaceId, id);
  const patch: Partial<typeof webhooks.$inferInsert> = {};
  if (input.url !== undefined) patch.url = input.url;
  if (input.events !== undefined) patch.events = JSON.stringify(input.events);
  if (input.enabled !== undefined) patch.enabled = input.enabled;
  await db.update(webhooks).set(patch).where(eq(webhooks.id, id));
  return toWebhook(await getWebhookRow(workspaceId, id));
}

export async function deleteWebhook(workspaceId: string, id: string): Promise<void> {
  await getWebhookRow(workspaceId, id);
  await db.delete(webhooks).where(eq(webhooks.id, id));
}

async function buildPayload(event: WebhookEvent, workspaceId: string, objectId: string | null, actorId: string): Promise<WebhookPayload> {
  const workspaceRows = await db.select({ id: workspaces.id, name: workspaces.name }).from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  const actorRows = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.id, actorId)).limit(1);

  let objectPayload: WebhookPayload["object"] = null;
  let objectTypePayload: WebhookPayload["objectType"] = null;
  if (objectId) {
    // Reuses the same fully-resolved record (formula/rollup properties
    // included) the UI itself reads, instead of re-deriving property values
    // from the raw object_values table here - `deleteObject` fires this
    // event for an object that's already gone, so a lookup failure just
    // means the payload's `object` field stays null.
    const record = await getObject(objectId).catch(() => null);
    if (record) {
      objectPayload = {
        id: record.id,
        title: record.title,
        icon: record.icon,
        cover: record.cover,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        archivedAt: record.archivedAt,
        lockedAt: record.lockedAt,
        values: record.values,
      };
      const typeRows = await db
        .select({ id: objectTypes.id, key: objectTypes.key, name: objectTypes.name })
        .from(objectTypes)
        .where(eq(objectTypes.id, record.objectTypeId))
        .limit(1);
      objectTypePayload = typeRows[0] ?? null;
    }
  }

  return {
    id: newId(),
    event,
    timestamp: nowIso(),
    workspace: workspaceRows[0] ?? { id: workspaceId, name: "" },
    objectType: objectTypePayload,
    object: objectPayload,
    actor: actorRows[0] ?? null,
  };
}

function sign(secret: string, body: string): string {
  return `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
}

async function deliver(row: typeof webhooks.$inferSelect, payload: WebhookPayload): Promise<void> {
  const body = JSON.stringify(payload);
  const secret = decrypt(row.secret);
  let status: "success" | "failure" = "success";
  let error: string | null = null;

  try {
    const response = await fetch(row.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Notorious-Event": payload.event,
        "X-Notorious-Delivery": payload.id,
        "X-Notorious-Signature": sign(secret, body),
      },
      body,
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    });
    if (!response.ok) {
      status = "failure";
      error = `HTTP ${response.status}`;
    }
  } catch (err) {
    status = "failure";
    error = err instanceof Error ? err.message : "Delivery failed";
  }

  await db
    .update(webhooks)
    .set({ lastTriggeredAt: nowIso(), lastStatus: status, lastError: error })
    .where(eq(webhooks.id, row.id));
}

/**
 * Called from realtime/activity.ts's `recordAndBroadcast` after every object
 * change (see that file's own hook point, same shape as
 * scripting/automation.ts's `maybeScheduleAutomation`) - fire-and-forget, so
 * a slow/unreachable webhook endpoint never delays the request that
 * triggered it.
 */
export function maybeDispatchWebhooks(event: WebhookEvent, workspaceId: string, objectId: string | null, actorId: string): void {
  void (async () => {
    const rows = await db.select().from(webhooks).where(and(eq(webhooks.workspaceId, workspaceId), eq(webhooks.enabled, true)));
    const subscribed = rows.filter((row) => (JSON.parse(row.events) as WebhookEvent[]).includes(event));
    if (subscribed.length === 0) return;

    const payload = await buildPayload(event, workspaceId, objectId, actorId);
    await Promise.allSettled(subscribed.map((row) => deliver(row, { ...payload, id: newId() })));
  })();
}

/** Sends a synthetic ping so a user can verify their endpoint before relying on it - see WebhooksSettings.tsx's "Send test" button. */
export async function sendTestWebhook(workspaceId: string, id: string): Promise<void> {
  const row = await getWebhookRow(workspaceId, id);
  const payload = await buildPayload("object.updated", workspaceId, null, row.createdBy);
  await deliver(row, { ...payload, object: null, objectType: null });
}
