import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { ExcalidrawProps } from "@excalidraw/excalidraw/types";
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
 * Not re-parsed on every external content change (only once, via the lazy
 * `useState` initializer below): unlike a title or a text field, Excalidraw
 * owns its element/selection/viewport state internally once mounted, so
 * there's no good way to "merge in" someone else's concurrent edit without
 * remounting the whole canvas and losing the current view/selection. This
 * matches the app's overall last-write-wins model (see docs/ARCHITECTURE.md) -
 * a collaborator's changes appear after next opening the block, not live
 * mid-session.
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
   * the drawing never actually gets saved. Since Excalidraw already owns its
   * canvas state internally (see parseInitialData's note above) and nothing
   * here needs to re-render on every change, the pending value and timer
   * live in plain refs instead - no state update, no new callback identity,
   * no loop.
   */
  const contentRef = useRef(externalContent);
  const pendingRef = useRef<WhiteboardContent | null>(null);
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();
  const isSavingRef = useRef(false);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

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

  return (
    <div className="h-[600px] w-full overflow-hidden rounded-lg border border-border">
      <Suspense
        fallback={<div className="flex h-full items-center justify-center text-sm text-ink-muted">Loading whiteboard…</div>}
      >
        <ExcalidrawLazy initialData={initialDataArg} onChange={handleChange} theme={theme} />
      </Suspense>
    </div>
  );
}
