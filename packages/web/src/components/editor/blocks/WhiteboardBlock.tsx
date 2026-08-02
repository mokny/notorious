import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ExcalidrawImperativeAPI, ExcalidrawProps, NormalizedZoomValue } from "@excalidraw/excalidraw/types";
import type { ImportedDataState } from "@excalidraw/excalidraw/data/types";
import type { WhiteboardContent } from "@notorious/shared";
import { useTheme } from "../../../context/ThemeContext.js";
import { useAuth } from "../../../context/AuthContext.js";
import { workspaceApi } from "../../../lib/api/resources.js";
import { Icon } from "../../ui/Icon.js";

const SAVE_DEBOUNCE_MS = 500;
// Matches Excalidraw's own (undocumented-as-a-prop, so mirrored here rather
// than imported) zoom bounds and step - see MIN_ZOOM/MAX_ZOOM/ZOOM_STEP in
// its constants.ts.
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 30;
const ZOOM_STEP_FACTOR = 1.2;

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
  workspaceId,
  onSave,
}: {
  content: WhiteboardContent;
  workspaceId: string;
  onSave: (c: WhiteboardContent) => Promise<void>;
}) {
  const { theme } = useTheme();
  const { user } = useAuth();
  // Same query key ObjectDetailPage.tsx/WorkspaceLayout.tsx already use for
  // this workspace - reads from their cache instead of an extra fetch.
  const { data: workspace } = useQuery({ queryKey: ["workspace", workspaceId], queryFn: () => workspaceApi.get(workspaceId) });
  const isOwner = Boolean(workspace && user && workspace.ownerId === user.id);
  // Read straight from the reactive `content` prop, not the drawing-only
  // `contentRef` below (which is deliberately non-reactive to avoid a
  // render loop - see its own doc comment) - a collaborator starting/
  // stopping a presentation needs to flip everyone else's view mode the
  // moment that update arrives, the same as any other synced field.
  const presenting = externalContent.presenting ?? false;
  // Purely local - which browser tab has this whiteboard enlarged is not
  // shared state, unlike `presenting`.
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  // Whatever tool was last active when the scene was saved (almost always
  // "selection", Excalidraw's own default) isn't what we want to reopen
  // into - a whiteboard embedded in a block is looked at/panned around far
  // more often than it's drawn on, so every fresh open should start on the
  // hand tool instead of requiring a click to get there first.
  const HAND_TOOL = { type: "hand", customType: null, lastActiveTool: null, locked: false } as const;

  const [initialDataArg] = useState<ExcalidrawProps["initialData"]>(() => async () => {
    const mod = await import("@excalidraw/excalidraw");
    const parsed = parseInitialData(contentRef.current.sceneJson);
    const restored = parsed ? mod.restore(parsed, null, null) : null;
    if (restored?.elements.length) {
      // `excalidrawApiRef` is already set at this point - Excalidraw hands
      // it out from its constructor, which always runs (synchronously,
      // during render) before this function is even invoked (from inside
      // componentDidMount, to await this exact `initialData` prop). But
      // calling `scrollToContent` *right now* would still act on the empty
      // scene this component mounted with - Excalidraw only applies the
      // `elements`/`appState` we're about to return once this promise
      // resolves and its own `.then()` continuation runs. A macrotask
      // (`setTimeout(0)`, not just a microtask/`queueMicrotask`) reliably
      // fires after that continuation, once the restored scene is actually
      // in place - which is what makes `fitToContent` see real content
      // instead of nothing. `animate: false` here (unlike the "Fit to
      // content" button below, which deliberately animates a click the user
      // is watching) - this one should already look correct on the very
      // first paint, not visibly snap into place a moment later.
      setTimeout(() => {
        excalidrawApiRef.current?.scrollToContent(restored.elements, { fitToContent: true, animate: false });
      }, 0);
    }
    return { ...restored, appState: { ...restored?.appState, activeTool: HAND_TOOL } };
  });

  const onChangeImpl: NonNullable<ExcalidrawProps["onChange"]> = (elements, appState, files) => {
    if (isApplyingRemoteRef.current) return;
    if (appState.zenModeEnabled) {
      // Zen mode (a built-in Excalidraw toggle, not something this app
      // exposes deliberately) slides the entire footer - including the
      // zoom controls - off-screen. Zoom needs to stay reachable
      // unconditionally, so immediately force it back off instead of
      // saving/allowing this state. Skips the save below for *this*
      // particular onChange - the corrective `updateScene` call fires its
      // own onChange once zenModeEnabled is actually false again, and
      // that's the one that ends up persisted.
      void import("@excalidraw/excalidraw").then(({ CaptureUpdateAction }) => {
        excalidrawApiRef.current?.updateScene({ appState: { zenModeEnabled: false }, captureUpdate: CaptureUpdateAction.NEVER });
      });
      return;
    }
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

  /**
   * Routed through the same `contentRef`/`pendingRef` pipeline `onChangeImpl`
   * uses, not a separate direct `onSave` call - a save already queued from
   * drawing (debounced up to `SAVE_DEBOUNCE_MS`) still holds whatever
   * `presenting` value was true *when that stroke was drawn*, baked in by
   * `onChangeImpl`'s `{ ...contentRef.current, sceneJson }` spread. If this
   * toggle saved independently, that stale queued save would land *after*
   * it and silently flip `presenting` back - exactly the "turns itself back
   * on shortly after I disabled it" bug. Folding the new value into the same
   * pending value (and flushing immediately, ahead of the debounce timer)
   * keeps there being only one, always-current save in flight/queued.
   */
  function togglePresenting(): void {
    const next = { ...(pendingRef.current ?? contentRef.current), presenting: !presenting };
    contentRef.current = next;
    pendingRef.current = next;
    clearTimeout(saveTimeout.current);
    flush();
  }

  /**
   * Excalidraw's own zoom controls (the bottom-left "- 100% +" widget) only
   * render once its container is wide enough to clear its internal
   * mobile/desktop breakpoint (730px, see MQ_MAX_WIDTH_PORTRAIT in its own
   * constants) - this block is a fixed 600px-tall card embedded in a
   * narrower content column, so that widget never actually appears unless
   * fullscreened, and there's no other reachable UI for zooming (no menu
   * item either) - only an undiscoverable ctrl/cmd+scroll or pinch. These
   * buttons replace that with something always visible regardless of the
   * block's own width or fullscreen state.
   */
  async function zoomBy(factor: number): Promise<void> {
    const api = excalidrawApiRef.current;
    if (!api) return;
    const { CaptureUpdateAction, viewportCoordsToSceneCoords } = await import("@excalidraw/excalidraw");
    const state = api.getAppState();
    const nextValue = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, state.zoom.value * factor));
    if (nextValue === state.zoom.value) return;
    // Zooms toward the middle of the visible canvas - there's no cursor
    // position to anchor to from a button click, unlike Excalidraw's own
    // ctrl+scroll handling. Just setting `zoom.value` alone would instead
    // scale from the canvas's own (0,0) origin, visibly yanking the current
    // view toward its top-left corner on every click.
    const center = { clientX: state.width / 2, clientY: state.height / 2 };
    const anchor = viewportCoordsToSceneCoords(center, {
      zoom: state.zoom,
      offsetLeft: 0,
      offsetTop: 0,
      scrollX: state.scrollX,
      scrollY: state.scrollY,
    });
    api.updateScene({
      appState: {
        zoom: { value: nextValue as NormalizedZoomValue },
        scrollX: center.clientX / nextValue - anchor.x,
        scrollY: center.clientY / nextValue - anchor.y,
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }

  function zoomToFit(): void {
    excalidrawApiRef.current?.scrollToContent(undefined, { fitToContent: true, animate: true });
  }

  return (
    <div
      // z-[60], not the app's usual z-50 popover/modal tier: fullscreen is
      // meant to cover *everything* unconditionally, but at z-50 it tied
      // with (among other things) ObjectSlugButton.tsx's portaled `{}`
      // button and BlockSlugButton.tsx's own - a tied z-index falls back to
      // DOM order, and both of those buttons happened to land later in the
      // DOM than this div, so they rendered on top of a "fullscreen" canvas
      // instead of being covered by it. Needs to outrank the entire z-50
      // tier outright rather than share it.
      className={`flex flex-col overflow-hidden ${
        isFullscreen ? "fixed inset-0 z-[60] bg-surface" : "h-[600px] w-full rounded-lg border border-border"
      }`}
    >
      {/* A row of its own above the canvas, not an overlay on top of it -
          Excalidraw's own floating toolbar sits centered along this same
          top edge, and an absolutely-positioned bar here used to visibly
          collide with the right end of it (its "more tools"/lock/hand
          buttons) at any width narrow enough that both wanted the same
          space. Stacking them in normal flow instead means each gets its
          own full-width row and neither has to yield. */}
      <div className="flex shrink-0 items-center gap-1 border-b border-border bg-surface-raised px-2 py-1">
        {presenting && !isOwner && (
          <span className="flex items-center gap-1 px-1.5 text-xs text-accent">
            <Icon name="presentation" className="h-3.5 w-3.5" /> Presenting
          </span>
        )}
        {isOwner && (
          <button
            type="button"
            onClick={togglePresenting}
            title={presenting ? "Stop presenting - everyone can draw again" : "Start presenting - only you can draw while this is on"}
            className={`flex items-center gap-1 rounded p-1.5 text-xs ${
              presenting ? "bg-accent/10 text-accent" : "text-ink-muted hover:bg-surface hover:text-ink"
            }`}
          >
            <Icon name="presentation" className="h-3.5 w-3.5" />
          </button>
        )}
        <div className="ml-auto flex items-center gap-1">
          {/* Own zoom controls, always shown regardless of the block's width
              or fullscreen state - see zoomBy/zoomToFit's own doc comment for
              why Excalidraw's built-in ones can't be relied on here. A view
              action like fullscreen below, not an edit - stays usable while
              the object is locked. */}
          <button
            type="button"
            onClick={() => void zoomBy(1 / ZOOM_STEP_FACTOR)}
            title="Zoom out"
            data-view-toggle
            className="rounded p-1.5 text-ink-muted hover:bg-surface hover:text-ink"
          >
            <Icon name="zoom-out" className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void zoomBy(ZOOM_STEP_FACTOR)}
            title="Zoom in"
            data-view-toggle
            className="rounded p-1.5 text-ink-muted hover:bg-surface hover:text-ink"
          >
            <Icon name="zoom-in" className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={zoomToFit}
            title="Fit to content"
            data-view-toggle
            className="rounded p-1.5 text-ink-muted hover:bg-surface hover:text-ink"
          >
            <Icon name="scan" className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setIsFullscreen((v) => !v)}
            title={isFullscreen ? "Exit fullscreen" : "Fill the browser window"}
            // A personal view preference, not shared content - stays usable
            // even while the object is locked (see readOnlyContent.ts).
            data-view-toggle
            className="rounded p-1.5 text-ink-muted hover:bg-surface hover:text-ink"
          >
            <Icon name={isFullscreen ? "minimize" : "maximize"} className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="min-h-0 flex-1">
        <Suspense
          fallback={<div className="flex h-full items-center justify-center text-sm text-ink-muted">Loading whiteboard…</div>}
        >
          <ExcalidrawLazy
            initialData={initialDataArg}
            onChange={handleChange}
            theme={theme}
            excalidrawAPI={onExcalidrawApi}
            viewModeEnabled={presenting && !isOwner}
          />
        </Suspense>
      </div>
    </div>
  );
}
