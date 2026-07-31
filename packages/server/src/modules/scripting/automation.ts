import * as objectService from "../objects/service.js";
import * as scriptingService from "./service.js";

const DEBOUNCE_MS = 800;
const MAX_RUNS_PER_MINUTE = 6;
const WINDOW_MS = 60_000;

const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const runWindows = new Map<string, number[]>();
const pausedObjects = new Set<string>();

/**
 * First non-blank line must be exactly this (case-sensitive) - a plain
 * string check, not real parsing, matching this feature's "shouldn't be too
 * complicated" brief and formula.ts's own hand-rolled-but-simple precedent.
 */
export function isAutomationScript(source: string | null): boolean {
  if (!source) return false;
  const firstLine = source.split("\n", 1)[0]?.trim() ?? "";
  return firstLine === "// @automation";
}

/**
 * Called from realtime/activity.ts's `recordAndBroadcast` after every
 * object/block/relation change - the single hook point for triggering
 * automations (see that file for the `skipAutomationTrigger` flag that
 * keeps a script's own writes from re-triggering itself). Debounces rapid
 * successive edits into one run.
 */
export function maybeScheduleAutomation(objectId: string): void {
  if (pausedObjects.has(objectId)) return;
  const existing = debounceTimers.get(objectId);
  if (existing) clearTimeout(existing);
  debounceTimers.set(
    objectId,
    setTimeout(() => {
      debounceTimers.delete(objectId);
      void triggerAutomationRun(objectId);
    }, DEBOUNCE_MS),
  );
}

/** Re-arms a previously auto-paused object - called when a human explicitly re-enables automation (see service.ts's `setScriptEnabled`), since that's a deliberate signal they've addressed whatever caused the loop. */
export function clearPause(objectId: string): void {
  pausedObjects.delete(objectId);
  runWindows.delete(objectId);
}

async function triggerAutomationRun(objectId: string): Promise<void> {
  const object = await objectService.getObject(objectId).catch(() => null);
  if (!object || !object.scriptEnabled || !isAutomationScript(object.scriptSource)) return;

  // Independent of the `skipAutomationTrigger` self-retrigger guard - this
  // catches *cross-object* cascades (A's script writes B, B's automation
  // writes back to A) that guard can't see, since B's trigger is a genuine
  // new one, not an echo of A's own write. See the plan's rationale for why
  // 6/minute is a safe threshold: legitimate automations reacting to human
  // edits are far sparser than that; a real loop blows past it in seconds.
  const window = (runWindows.get(objectId) ?? []).filter((t) => Date.now() - t < WINDOW_MS);
  if (window.length >= MAX_RUNS_PER_MINUTE) {
    pausedObjects.add(objectId);
    await scriptingService.persistRunResult(objectId, {
      ranAt: new Date().toISOString(),
      success: false,
      triggerType: "automation",
      durationMs: 0,
      log: "",
      error: `Automation paused: ran ${MAX_RUNS_PER_MINUTE}+ times in a row within a minute - check for a loop (e.g. two objects whose automations write back to each other). Turn automation off and back on to try again.`,
    });
    return;
  }
  window.push(Date.now());
  runWindows.set(objectId, window);

  await scriptingService.runScript(objectId, { isAutomated: true });
}
