import { useEffect, useState } from "react";
import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useSearchOverlay } from "../../context/SearchOverlayContext.js";
import { SearchPanel } from "./SearchPanel.js";

// How far (px) or how fast (px/s) a downward drag has to go before it counts
// as "let go of the sheet" instead of springing back to fully open -
// mirrors the rough feel of iOS's own sheet dismiss gesture.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 500;

/**
 * How much of the layout viewport's bottom edge is currently covered by the
 * on-screen keyboard (0 when it's closed) - `window.innerHeight` doesn't
 * shrink for this on iOS Safari/PWA (that's what useDynamicViewportHeight.ts
 * works around for the app's own root height, see its doc comment), but
 * `visualViewport` does, so the gap between the two *is* the keyboard's
 * height. Local to this component rather than folded into that shared
 * `--app-vh` mechanism - this needs the *live*, keyboard-reactive value
 * (visualViewport.height), not the deliberately-more-stable one that hook
 * publishes for the rest of the app's layout.
 */
function useKeyboardInset(): number {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    function update() {
      setInset(Math.max(0, window.innerHeight - vv!.height - vv!.offsetTop));
    }
    update();
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
    };
  }, []);
  return inset;
}

/**
 * iOS-style slide-up search sheet for the phone breakpoint - see
 * SearchOverlayContext.tsx for the open/close state this reads, and
 * SearchPanel.tsx for the actual search box/results it wraps (shared with
 * the desktop/tablet `/search` route). Rendered once in WorkspaceLayout,
 * over whatever page is currently open, instead of being a route of its
 * own - closing it just leaves the underlying page exactly as it was.
 */
export function SearchSheet({ workspaceId }: { workspaceId: string }) {
  const { isOpen, close } = useSearchOverlay();
  const navigate = useNavigate();
  const keyboardInset = useKeyboardInset();

  function handleSelect(objectId: string, query: string) {
    close();
    const params = new URLSearchParams({ highlight: query });
    navigate(`/w/${workspaceId}/objects/${objectId}?${params}`);
  }

  function handleDragEnd(_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    if (info.offset.y > DISMISS_DISTANCE || info.velocity.y > DISMISS_VELOCITY) close();
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/40 md:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
          />
          <motion.div
            className="fixed inset-x-0 z-40 flex flex-col rounded-t-2xl bg-surface shadow-2xl md:hidden"
            // `bottom: keyboardInset` (not a plain `bottom-0`) - if the
            // user taps the field and the keyboard opens, this shrinks the
            // sheet up from the bottom to fit above it, instead of keeping
            // its full height and relying on iOS's own "scroll the focused
            // input into view" to compensate, which can end up shifting the
            // whole fixed sheet upward as a page-level pan. See
            // useKeyboardInset's own comment.
            style={{ top: "calc(env(safe-area-inset-top) + 2.5rem)", bottom: keyboardInset }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={handleDragEnd}
          >
            <div className="flex shrink-0 justify-center py-2">
              <div className="h-1.5 w-10 rounded-full bg-ink-muted/30" />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4" style={{ paddingBottom: "calc(1rem + env(safe-area-inset-bottom))" }}>
              <SearchPanel workspaceId={workspaceId} onSelect={handleSelect} autoFocus={false} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
