import type { RealtimeEvent, ActivityEntry } from "@notorious/shared";
import { db } from "../../db/client.js";
import { activityLog } from "../../db/schema.js";
import { newId, nowIso } from "../../lib/ids.js";
import { broadcast } from "./hub.js";

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
