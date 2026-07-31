import { getQuickJS, Scope, shouldInterruptAfterDeadline, type QuickJSContext, type QuickJSWASMModule } from "quickjs-emscripten";

let quickJSModule: QuickJSWASMModule | null = null;

/** Loads the QuickJS WASM module once - call during server boot (see server.ts). WASM instantiation has real overhead, so this is a process-lifetime singleton, not something done per script run. */
export async function initScriptEngine(): Promise<void> {
  quickJSModule = await getQuickJS();
}

export const SCRIPT_LIMITS = {
  maxSourceLength: 20_000,
  timeoutMs: 2000,
  memoryBytes: 16 * 1024 * 1024,
  maxStackBytes: 1024 * 1024,
  maxLogChars: 10_000,
  maxPropertyWrites: 50,
  maxBlockUpdates: 50,
  maxAppendedBlocks: 20,
} as const;

export interface ScriptExecutionOutcome {
  ok: boolean;
  /** Present only when `ok` is false. */
  errorMessage?: string;
  timedOut: boolean;
}

/**
 * Runs `source` inside a brand-new QuickJS runtime+context - never reused
 * across runs, so one script's bound host closures/state can never leak
 * into the next. `install` is called first (before `evalCode`) to bind
 * whatever host globals/functions this run needs - see api.ts, which is the
 * only caller. Every limit (timeout/memory/stack) is enforced by the
 * runtime itself; a script that exceeds one fails via QuickJS's own error/
 * interrupt machinery, surfaced here as a plain result object, not a thrown
 * Node exception - this function itself never throws for a *script's own*
 * failure, only for engine misuse (e.g. calling before `initScriptEngine`).
 */
export function executeScript(source: string, install: (context: QuickJSContext) => void): ScriptExecutionOutcome {
  if (!quickJSModule) throw new Error("Script engine not initialized - initScriptEngine() must be awaited at server boot");
  if (source.length > SCRIPT_LIMITS.maxSourceLength) {
    return { ok: false, errorMessage: "Script source exceeds the maximum length", timedOut: false };
  }

  const deadline = Date.now() + SCRIPT_LIMITS.timeoutMs;

  return Scope.withScope((scope) => {
    const runtime = scope.manage(
      quickJSModule!.newRuntime({
        interruptHandler: shouldInterruptAfterDeadline(deadline),
        memoryLimitBytes: SCRIPT_LIMITS.memoryBytes,
        maxStackSizeBytes: SCRIPT_LIMITS.maxStackBytes,
      }),
    );
    const context = scope.manage(runtime.newContext());

    install(context);

    const result = context.evalCode(source);
    if (result.error) {
      const errorHandle = scope.manage(result.error);
      const errorValue = context.dump(errorHandle) as { name?: string; message?: string } | string;
      const message =
        typeof errorValue === "string"
          ? errorValue
          : `${errorValue.name ?? "Error"}: ${errorValue.message ?? "Unknown error"}`;
      return { ok: false, errorMessage: message, timedOut: message.includes("interrupted") };
    }

    scope.manage(result.value);
    return { ok: true, timedOut: false };
  });
}
