import { eq, and, notInArray } from "drizzle-orm";
import type { RealtimeEvent, ActivityEntry } from "@notorious/shared";
import { db } from "../../db/client.js";
import { activityLog, blockHistory } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { broadcast } from "./hub.js";

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
