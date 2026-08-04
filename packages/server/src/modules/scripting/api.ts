import { BLOCK_TYPES } from "@notorious/shared";
import type { QuickJSContext, QuickJSHandle } from "quickjs-emscripten";
import { SCRIPT_LIMITS } from "./engine.js";
import type { ScriptObjectSnapshot, StagedWrites } from "./types.js";

export interface BindObjectApiParams {
  snapshot: ScriptObjectSnapshot;
  /** Every Variable object in the workspace, keyed by name - see modules/variables/service.ts's `buildVariablesMap`. Exposed as its own top-level `variables` global, not nested under `object`. */
  variables: Record<string, unknown>;
  staged: StagedWrites;
  logLines: string[];
  isAutomated: boolean;
}

function currentLogLength(logLines: string[]): number {
  return logLines.reduce((total, line) => total + line.length + 1, 0);
}

type ScriptPropertyValue = string | number | boolean | string[] | null;

/** `setProperty`'s value can be anything QuickJS's own `dump()` produces (arbitrary nested objects included) - narrowed here to the same primitive shape `updateObjectSchema.values` accepts, with a catchable script-side error otherwise, rather than letting a script silently stage a value the DB layer would either reject or store as-is unchecked. */
function validatePropertyValue(value: unknown): ScriptPropertyValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value) && value.every((item) => typeof item === "string")) return value as string[];
  throw new Error(
    "object.setProperty: value must be a string, number, boolean, array of strings, or null (got " + JSON.stringify(value) + ")",
  );
}

/**
 * Binds the `object` global a script sees, plus a handful of `__`-prefixed
 * host functions it's built from. Two halves, deliberately:
 *
 * - Read data (id/title/properties/blocks/relatedObjects) is a snapshot
 *   already fetched by service.ts *before* this runs - injected once via
 *   `JSON.parse` of a double-stringified literal, since quickjs-emscripten
 *   has no built-in "deep-copy a plain JS value into the VM" helper for the
 *   host->guest direction (only `context.dump()` for guest->host). This is
 *   also why relation reads are a snapshot, not live: nothing here can
 *   `await` a DB query mid-script (see engine.ts's module doc comment on
 *   why everything is synchronous).
 * - Write calls (`setProperty`/`setBlockContent`/`appendBlock`/`log`) are
 *   synchronous host closures that only push onto `staged`/`logLines` -
 *   never touch the DB. service.ts applies them after a successful run.
 */
export function bindObjectApi(context: QuickJSContext, params: BindObjectApiParams): void {
  const { snapshot, variables, staged, logLines, isAutomated } = params;

  const jsonLiteral = JSON.stringify(JSON.stringify(snapshot));
  runBootstrap(context, `globalThis.__snapshot = JSON.parse(${jsonLiteral});`);
  const variablesLiteral = JSON.stringify(JSON.stringify(variables));
  runBootstrap(context, `globalThis.variables = JSON.parse(${variablesLiteral});`);

  bindFunction(context, "__setProperty", (keyHandle, valueHandle) => {
    const key = context.getString(keyHandle);
    if (!(key in staged.properties) && Object.keys(staged.properties).length >= SCRIPT_LIMITS.maxPropertyWrites) {
      throw new Error(`object.setProperty: exceeded the limit of ${SCRIPT_LIMITS.maxPropertyWrites} property writes per run`);
    }
    const value = context.dump(valueHandle);
    staged.properties[key] = validatePropertyValue(value);
  });

  bindFunction(context, "__setBlockContent", (blockIdHandle, contentHandle) => {
    const blockId = context.getString(blockIdHandle);
    if (!staged.blockUpdates.has(blockId) && staged.blockUpdates.size >= SCRIPT_LIMITS.maxBlockUpdates) {
      throw new Error(`object.setBlockContent: exceeded the limit of ${SCRIPT_LIMITS.maxBlockUpdates} block updates per run`);
    }
    staged.blockUpdates.set(blockId, context.dump(contentHandle) as Record<string, unknown>);
  });

  bindFunction(context, "__appendBlock", (typeHandle, contentHandle) => {
    if (staged.appendedBlocks.length >= SCRIPT_LIMITS.maxAppendedBlocks) {
      throw new Error(`object.appendBlock: exceeded the limit of ${SCRIPT_LIMITS.maxAppendedBlocks} appended blocks per run`);
    }
    const type = context.getString(typeHandle);
    if (!(BLOCK_TYPES as readonly string[]).includes(type)) {
      throw new Error(`object.appendBlock: "${type}" is not a valid block type`);
    }
    staged.appendedBlocks.push({ type: type as (typeof BLOCK_TYPES)[number], content: context.dump(contentHandle) as Record<string, unknown> });
  });

  bindFunction(context, "__log", (...argHandles) => {
    if (currentLogLength(logLines) >= SCRIPT_LIMITS.maxLogChars) return;
    const parts = argHandles.map((handle) => {
      const value = context.dump(handle);
      return typeof value === "string" ? value : JSON.stringify(value);
    });
    const line = parts.join(" ");
    const remaining = SCRIPT_LIMITS.maxLogChars - currentLogLength(logLines);
    logLines.push(line.length > remaining ? `${line.slice(0, remaining)}...[truncated]` : line);
  });

  bindFunction(context, "__now", () => context.newString(new Date().toISOString()));

  runBootstrap(
    context,
    `globalThis.object = Object.assign({}, globalThis.__snapshot, {
      setProperty: __setProperty,
      setBlockContent: __setBlockContent,
      appendBlock: __appendBlock,
      log: __log,
      now: __now,
      automation: { isAutomated: ${isAutomated ? "true" : "false"} },
    });
    delete globalThis.__snapshot;
    delete globalThis.__setProperty;
    delete globalThis.__setBlockContent;
    delete globalThis.__appendBlock;
    delete globalThis.__log;
    delete globalThis.__now;`,
  );
}

function bindFunction(context: QuickJSContext, name: string, fn: (...args: QuickJSHandle[]) => QuickJSHandle | void): void {
  const fnHandle = context.newFunction(name, fn);
  context.setProp(context.global, name, fnHandle);
  fnHandle.dispose();
}

/** Runs a small trusted (host-authored, not user-authored) bootstrap snippet - used to assemble globals from already-bound pieces, not to run script content. */
function runBootstrap(context: QuickJSContext, source: string): void {
  const result = context.evalCode(source);
  if (result.error) {
    const message = context.dump(result.error) as unknown;
    result.error.dispose();
    throw new Error(`Script engine bootstrap failed: ${JSON.stringify(message)}`);
  }
  result.value.dispose();
}
