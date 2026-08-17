import { eq, and, notInArray } from "drizzle-orm";
import type { RealtimeEvent, ActivityEntry, WebhookEvent } from "@notorious/shared";
import { db } from "../../db/client.js";
import { activityLog, blockHistory } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { broadcast } from "./hub.js";
import { maybeScheduleAutomation } from "../scripting/automation.js";
import { maybeDispatchWebhooks, scheduleWebhookUpdate } from "../webhooks/service.js";
import { enqueueSubscriberNotifications } from "../subscriptions/service.js";

/** `ActivityEntry["action"]` has no "restored" case (see that type's own doc comment) - callers that need a webhook event distinct from the generic "updated" one (just the restore route today) pass this explicitly instead of relying on the action->event mapping below. */
const ACTION_TO_WEBHOOK_EVENT: Partial<Record<ActivityEntry["action"], WebhookEvent>> = {
  created: "object.created",
  updated: "object.updated",
  archived: "object.archived",
  deleted: "object.deleted",
};

const MAX_BLOCK_HISTORY = 10;

interface RecordChangeInput {
  workspaceId: string;
  objectId?: string | null;
  actorId: string;
  action: ActivityEntry["action"];
  summary: string;
  entity: RealtimeEvent["entity"];
  entityId: string;
  realtimeAction: RealtimeEvent["action"];
  /** The originating browser tab, so it can skip its own echoed broadcast. */
  clientId?: string;
  /**
   * Required to populate block_history's denormalized actor_name when
   * `entity` is "block" (see BlockHistoryPanel.tsx) - optional here only
   * because the other ~20 call sites for other entities don't need it.
   */
  actorName?: string;
  /**
   * Set by the scripting module's own apply-phase (see modules/scripting/service.ts)
   * when committing a script's staged writes - without this, a script that
   * edits its own object would re-trigger its own automation forever. Real
   * user/API-driven edits never set this, so they always remain eligible to
   * trigger an object's automation - see modules/scripting/automation.ts.
   */
  skipAutomationTrigger?: boolean;
  /** Overrides the default action->webhook-event mapping - only needed where a single `action` value covers more than one distinct kind of change (see the restore route, which reuses `action: "updated"` but should still fire `object.restored`, not `object.updated`). */
  webhookEvent?: WebhookEvent;
}

/** Writes an audit-log row and broadcasts the change to connected clients in one call. */
export async function recordAndBroadcast(input: RecordChangeInput): Promise<void> {
  const at = nowIso();
  await db.insert(activityLog).values({
    id: newId(),
    workspaceId: input.workspaceId,
    objectId: input.objectId ?? null,
    actorId: input.actorId,
    action: input.action,
    summary: input.summary,
    createdAt: at,
  });

  if (input.entity === "block" && input.actorName) {
    await recordBlockHistory(input.entityId, input.workspaceId, input.actorId, input.actorName, input.action, input.summary, at);
  }

  broadcast({
    workspaceId: input.workspaceId,
    entity: input.entity,
    action: input.realtimeAction,
    entityId: input.entityId,
    objectId: input.objectId ?? null,
    actorId: input.actorId,
    clientId: input.clientId,
    at,
  });

  if (!input.skipAutomationTrigger && input.objectId) {
    maybeScheduleAutomation(input.objectId);
  }

  if (input.objectId) {
    await enqueueSubscriberNotifications(input.workspaceId, input.objectId, input.actorId);
  }

  if (input.entity === "object") {
    const webhookEvent = input.webhookEvent ?? ACTION_TO_WEBHOOK_EVENT[input.action];
    if (webhookEvent === "object.updated") {
      scheduleWebhookUpdate(input.workspaceId, input.entityId, input.actorId);
    } else if (webhookEvent) {
      maybeDispatchWebhooks(webhookEvent, input.workspaceId, input.entityId, input.actorId);
    }
  } else if (input.entity === "block" && input.objectId) {
    // A block has no lifecycle events of its own to subscribe to (see
    // WEBHOOK_EVENTS's own doc comment) - editing one's content is still an
    // update to the object it belongs to, so it feeds the same debounced
    // `object.updated` delivery a direct object edit would.
    scheduleWebhookUpdate(input.workspaceId, input.objectId, input.actorId);
  }
}

/** Appends one block_history row and trims that block's history back down to the 10 most recent - see migrations/0014_block_history.sql for why this is trimmed at write time rather than only at read time. */
async function recordBlockHistory(
  blockId: string,
  workspaceId: string,
  actorId: string,
  actorName: string,
  action: ActivityEntry["action"],
  summary: string,
  createdAt: string,
): Promise<void> {
  await db.insert(blockHistory).values({
    id: newId(),
    blockId,
    workspaceId,
    actorId,
    actorName,
    action,
    summary,
    createdAt,
  });

  const recent = await db
    .select({ id: blockHistory.id })
    .from(blockHistory)
    .where(eq(blockHistory.blockId, blockId))
    .orderBy(blockHistory.createdAt)
    .limit(1000);
  if (recent.length <= MAX_BLOCK_HISTORY) return;

  const keepIds = recent.slice(recent.length - MAX_BLOCK_HISTORY).map((row) => row.id);
  await db.delete(blockHistory).where(and(eq(blockHistory.blockId, blockId), notInArray(blockHistory.id, keepIds)));
}
