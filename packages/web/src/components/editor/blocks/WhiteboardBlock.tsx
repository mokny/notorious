import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ExcalidrawImperativeAPI, ExcalidrawProps } from "@excalidraw/excalidraw/types";
import type { ImportedDataState } from "@excalidraw/excalidraw/data/types";
import type { WhiteboardContent } from "@notorious/shared";
import { useTheme } from "../../../context/ThemeContext.js";

const SAVE_DEBOUNCE_MS = 500;

/**
 * Excalidraw (shapes, freehand drawing, arrows, text, a color picker, and an
 * infinite pan/zoomable canvas - exactly the feature set asked for) is a
 * multi-MB dependency with its own long chain of sub-dependencies (see
 * vite.config.ts's "vendor-whiteboard" chunk) - loaded on demand only when a
 * whiteboard block actually renders, not bundled into the app's main chunk.
 * Both `serializeAsJSON` and `restore` (used below) come from the same
 * dynamic import rather than a static one, so referencing them doesn't
 * accidentally pull the whole library back into the eagerly-loaded bundle.
 */
const ExcalidrawLazy = lazy(async () => {
  const [mod] = await Promise.all([import("@excalidraw/excalidraw"), import("@excalidraw/excalidraw/index.css")]);
  return { default: mod.Excalidraw };
});

/**
 * `sceneJson` is Excalidraw's own `.excalidraw` file-format string (from its
 * `serializeAsJSON` helper) - parsed back into the shape `restore()` expects.
 */
function parseInitialData(sceneJson: string | undefined): ImportedDataState | null {
  if (!sceneJson) return null;
  try {
    return JSON.parse(sceneJson) as ImportedDataState;
  } catch {
    return null;
  }
}

export function WhiteboardBlock({
  content: externalContent,
  onSave,
}: {
  content: WhiteboardContent;
  onSave: (c: WhiteboardContent) => Promise<void>;
}) {
  const { theme } = useTheme();

  /**
   * Deliberately NOT `useDebouncedSave` (used by every other block type):
   * that hook stores the pending value in React state so the debounce
   * survives re-renders, but doing that here re-renders WhiteboardBlock on
   * every single stroke, which hands Excalidraw a new `onChange` callback
   * identity mid-draw - and Excalidraw re-fires `onChange` when that
   * identity changes, which triggers another state update, which produces
   * another new identity, and so on. That feedback loop fires `onChange`
   * thousands of times a second and starves the debounce timer forever, so
   * the drawing never actually gets saved. The pending value and timer live
   * in plain refs instead - no state update, no new callback identity, no
   * loop.
   */
  const contentRef = useRef(externalContent);
  const pendingRef = useRef<WhiteboardContent | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();
  const isSavingRef = useRef(false);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  // Handle to the mounted canvas (set once Excalidraw itself mounts, via the
  // `excalidrawAPI` prop below) - used to push a collaborator's update onto
  // the live scene without remounting the whole canvas (see the effect
  // further down).
  const excalidrawApiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  // Set for the duration of a programmatic `updateScene(...)` call applying
  // someone else's edit, so the `onChange` that call itself triggers isn't
  // mistaken for a local edit and re-saved/re-broadcast right back out.
  const isApplyingRemoteRef = useRef(false);

  useEffect(() => () => clearTimeout(saveTimeout.current), []);

  function flush(): void {
    if (isSavingRef.current || pendingRef.current === null) return;
    const value = pendingRef.current;
    pendingRef.current = null;
    isSavingRef.current = true;
    onSaveRef
      .current(value)
      .catch(() => {})
      .finally(() => {
        isSavingRef.current = false;
        flush();
      });
  }

  const [initialDataArg] = useState<ExcalidrawProps["initialData"]>(() => async () => {
    const mod = await import("@excalidraw/excalidraw");
    const parsed = parseInitialData(contentRef.current.sceneJson);
    if (!parsed) return null;
    return mod.restore(parsed, null, null);
  });

  const onChangeImpl: NonNullable<ExcalidrawProps["onChange"]> = (elements, appState, files) => {
    if (isApplyingRemoteRef.current) return;
    void import("@excalidraw/excalidraw").then(({ serializeAsJSON }) => {
      const value = { ...contentRef.current, sceneJson: serializeAsJSON(elements, appState, files, "local") };
      contentRef.current = value;
      pendingRef.current = value;
      clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    });
  };
  // Only the first render's closure is kept (useRef's initial value is ignored on
  // re-render) - this is what keeps the onChange identity stable across renders.
  const handleChange = useRef(onChangeImpl).current;

  const onExcalidrawApi = useRef((api: ExcalidrawImperativeAPI) => {
    excalidrawApiRef.current = api;
  }).current;

  /**
   * Live collaboration: a workspace-mate's edit arrives here as a normal
   * `content` prop update (the realtime layer just invalidates the block
   * query - see useRealtime.ts's "block" case), not as a WebSocket message
   * this component reads directly. Since Excalidraw owns its canvas state
   * internally once mounted (a plain prop change doesn't reach it the way
   * it would for a controlled `<input>`), applying it has to go through the
   * imperative `updateScene` API instead of just re-rendering.
   *
   * Two guards keep this from misbehaving:
   * - Skip if this is our own change echoing back (same content we already
   *   have) or a stale re-render - only act on a value that's actually new.
   * - Skip if we have an unsaved local edit in flight (`pendingRef`/
   *   `isSavingRef`): our own upcoming save is about to overwrite the
   *   server anyway (last-write-wins, same policy as every other block
   *   type - see docs/ARCHITECTURE.md), so clobbering an active local
   *   drawing with a slightly-stale remote one would only lose work.
   *
   * Deliberately omits `appState` when applying the remote scene: the
   * `.excalidraw` export format's appState is scene-level (background
   * color, grid) rather than per-viewer (scroll position, zoom), but
   * there's no reason to make a collaborator's edit jump this viewer's
   * camera around - only the shapes update, this viewer's own pan/zoom
   * stays put.
   */
  useEffect(() => {
    if (externalContent.sceneJson === contentRef.current.sceneJson) return;
    if (pendingRef.current !== null || isSavingRef.current) return;
    const api = excalidrawApiRef.current;
    if (!api) return;

    const parsed = parseInitialData(externalContent.sceneJson);
    if (!parsed) return;

    void import("@excalidraw/excalidraw").then(({ restore, CaptureUpdateAction }) => {
      const restored = restore(parsed, null, null);
      isApplyingRemoteRef.current = true;
      api.updateScene({ elements: restored.elements, captureUpdate: CaptureUpdateAction.NEVER });
      contentRef.current = externalContent;
      queueMicrotask(() => {
        isApplyingRemoteRef.current = false;
      });
    });
  }, [externalContent]);

  return (
    <div className="h-[600px] w-full overflow-hidden rounded-lg border border-border">
      <Suspense
        fallback={<div className="flex h-full items-center justify-center text-sm text-ink-muted">Loading whiteboard…</div>}
      >
        <ExcalidrawLazy initialData={initialDataArg} onChange={handleChange} theme={theme} excalidrawAPI={onExcalidrawApi} />
      </Suspense>
    </div>
  );
}
