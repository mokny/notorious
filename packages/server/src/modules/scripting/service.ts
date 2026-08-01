import { eq } from "drizzle-orm";
import type { ObjectRecord, ScriptRunSummary } from "@notorious/shared";
import { db } from "../../db/client.js";
import { objects, objectTypes } from "../../db/schema.js";
import { nowIso } from "../../lib/ids.js";
import { badRequest } from "../../lib/httpError.js";
import * as objectService from "../objects/service.js";
import { listProperties } from "../schema/service.js";
import * as blockService from "../blocks/service.js";
import { recordAndBroadcast } from "../realtime/activity.js";
import { clearPause } from "./automation.js";
import { executeScript, SCRIPT_LIMITS } from "./engine.js";
import { bindObjectApi } from "./api.js";
import { createEmptyStagedWrites, type ScriptObjectSnapshot, type ScriptRelatedObjectSnapshot } from "./types.js";

const MAX_RELATED_OBJECTS_TOTAL = 200;

export async function updateScriptSource(objectId: string, scriptSource: string | null): Promise<ObjectRecord> {
  await db.update(objects).set({ scriptSource, updatedAt: nowIso() }).where(eq(objects.id, objectId));
  return objectService.getObject(objectId);
}

export async function setScriptEnabled(objectId: string, enabled: boolean): Promise<ObjectRecord> {
  await db.update(objects).set({ scriptEnabled: enabled, updatedAt: nowIso() }).where(eq(objects.id, objectId));
  // Re-enabling is a deliberate human signal they've dealt with whatever
  // tripped the loop guard (see automation.ts) - without this, a paused
  // object would stay silently paused until the process restarts even
  // after the user flips the switch back on.
  if (enabled) clearPause(objectId);
  return objectService.getObject(objectId);
}

/** Shared by a real run's own completion and automation.ts's "paused, didn't even run" synthetic result - both are just "the last thing that happened with this object's script," shown identically in ScriptPanel.tsx. */
export async function persistRunResult(objectId: string, result: ScriptRunSummary): Promise<void> {
  await db
    .update(objects)
    .set({
      scriptLastRunAt: result.ranAt,
      scriptLastRunSuccess: result.success,
      scriptLastRunTrigger: result.triggerType,
      scriptLastRunDurationMs: result.durationMs,
      scriptLastRunError: result.error,
      scriptLastRunLog: result.log,
    })
    .where(eq(objects.id, objectId));
}

async function buildSnapshot(objectId: string): Promise<ScriptObjectSnapshot> {
  const object = await objectService.getObject(objectId);
  const typeRows = await db.select({ key: objectTypes.key }).from(objectTypes).where(eq(objectTypes.id, object.objectTypeId)).limit(1);
  const props = await listProperties(object.objectTypeId);
  const blocks = await blockService.listBlocks(objectId);

  const relatedObjects: Record<string, ScriptRelatedObjectSnapshot[]> = {};
  let totalFetched = 0;
  for (const property of props) {
    if (property.type !== "relation") continue;
    const targetIds = Array.isArray(object.values[property.key]) ? (object.values[property.key] as string[]) : [];
    const snapshots: ScriptRelatedObjectSnapshot[] = [];
    for (const targetId of targetIds) {
      if (totalFetched >= MAX_RELATED_OBJECTS_TOTAL) break;
      try {
        const target = await objectService.getObject(targetId);
        snapshots.push({ id: target.id, title: target.title, properties: target.values });
        totalFetched++;
      } catch {
        // Target since deleted/inaccessible - same tolerance the UI already has for dangling relation ids elsewhere.
      }
    }
    relatedObjects[property.key] = snapshots;
  }

  return {
    id: object.id,
    typeKey: typeRows[0]?.key ?? "",
    title: object.title,
    createdAt: object.createdAt,
    updatedAt: object.updatedAt,
    properties: object.values,
    blocks: blocks.map((block) => ({ id: block.id, type: block.type, content: block.content, position: block.position })),
    relatedObjects,
  };
}

interface RunScriptOptions {
  isAutomated: boolean;
  /** Only present for a manual, user-triggered run - see routes.ts. */
  actor?: { actorId: string; actorName: string };
  /** The originating browser tab for a manual run (see routes.ts's `getClientId`) - threaded through to `recordAndBroadcast` so that tab's own realtime echo is skipped, same as any other mutation. Automated runs have no tab, so this stays undefined for them. */
  clientId?: string;
}

export async function runScript(objectId: string, options: RunScriptOptions): Promise<ScriptRunSummary> {
  const object = await objectService.getObject(objectId);
  if (!object.scriptSource) throw badRequest("This object has no script configured");
  if (options.isAutomated && !object.scriptEnabled) throw badRequest("Automation is disabled for this object");

  const startedAt = Date.now();
  const snapshot = await buildSnapshot(objectId);
  const staged = createEmptyStagedWrites();
  const logLines: string[] = [];

  const outcome = executeScript(object.scriptSource, (context) =>
    bindObjectApi(context, { snapshot, staged, logLines, isAutomated: options.isAutomated }),
  );
  const durationMs = Date.now() - startedAt;
  const ranAt = nowIso();

  if (!outcome.ok) {
    const result: ScriptRunSummary = {
      ranAt,
      success: false,
      triggerType: options.isAutomated ? "automation" : "manual",
      durationMs,
      log: logLines.join("\n").slice(0, SCRIPT_LIMITS.maxLogChars),
      error: outcome.errorMessage ?? "Unknown error",
    };
    await persistRunResult(objectId, result);
    return result;
  }

  await applyStagedWrites(objectId, object, staged, options);

  const result: ScriptRunSummary = {
    ranAt,
    success: true,
    triggerType: options.isAutomated ? "automation" : "manual",
    durationMs,
    log: logLines.join("\n").slice(0, SCRIPT_LIMITS.maxLogChars),
    error: null,
  };
  await persistRunResult(objectId, result);
  return result;
}

async function applyStagedWrites(
  objectId: string,
  object: ObjectRecord,
  staged: ReturnType<typeof createEmptyStagedWrites>,
  options: RunScriptOptions,
): Promise<void> {
  const workspaceId = object.workspaceId;
  let touchedProperties = false;
  let touchedBlockId: string | null = null;

  if (Object.keys(staged.properties).length > 0) {
    await objectService.updateObject(objectId, { values: staged.properties });
    touchedProperties = true;
  }
  for (const [blockId, content] of staged.blockUpdates) {
    await blockService.updateBlock(blockId, { content });
    touchedBlockId ??= blockId;
  }
  for (const { type, content } of staged.appendedBlocks) {
    const block = await blockService.createBlock({ objectId, parentBlockId: null, afterBlockId: null, type, content });
    touchedBlockId ??= block.id;
  }

  if (!touchedProperties && !touchedBlockId) return;

  const { actorId, actorName } = resolveScriptActor(object, options);
  const summary = options.isAutomated ? `Script automation updated "${object.title}"` : `${actorName} ran a script on "${object.title}"`;

  if (touchedProperties) {
    await recordAndBroadcast({
      workspaceId,
      objectId,
      actorId,
      actorName,
      clientId: options.clientId,
      action: "updated",
      summary,
      entity: "object",
      entityId: objectId,
      realtimeAction: "updated",
      skipAutomationTrigger: true,
    });
  }
  // A separate broadcast, not folded into the one above - a normal
  // (non-script) block edit always broadcasts `entity: "block"` (see
  // blocks/routes.ts), which is what useRealtime.ts actually listens for to
  // invalidate `["blocks", objectId]`. Its `entity: "object"` handler never
  // did that, so a script that only touches blocks (e.g. the table-summing
  // automation example in docs/SCRIPTING.md) previously left every open tab
  // showing a stale block list until a manual reload, even though the write
  // itself had already landed.
  if (touchedBlockId) {
    await recordAndBroadcast({
      workspaceId,
      objectId,
      actorId,
      actorName,
      clientId: options.clientId,
      action: "updated",
      summary,
      entity: "block",
      entityId: touchedBlockId,
      realtimeAction: "updated",
      skipAutomationTrigger: true,
    });
  }
}

/** Manual runs attribute to the user who clicked Run; automated runs have no clicking user, so they attribute to whoever created the object - same "who to blame an automated action on" reasoning `resolveActor` already applies to anonymous share-link edits, just not a reuse of that function itself (it's specifically about share-link attribution). */
function resolveScriptActor(object: ObjectRecord, options: RunScriptOptions): { actorId: string; actorName: string } {
  if (!options.isAutomated && options.actor) return options.actor;
  return { actorId: object.createdBy, actorName: "Script automation" };
}
