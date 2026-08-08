import { useEffect, useRef } from "react";
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
  const inputRef = useRef<HTMLInputElement>(null);

  // `autoFocus` on the input itself (see SearchPanel.tsx's own prop) would
  // pop the keyboard the instant this mounts, fighting the slide-up
  // animation below (spring, damping 32/stiffness 320 - settles in ~350ms).
  // Focusing explicitly once that's roughly done reads as "the sheet
  // arrives, then the keyboard follows" instead of both happening at once.
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, [isOpen]);

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
            className="fixed inset-x-0 bottom-0 z-40 flex flex-col rounded-t-2xl bg-surface shadow-2xl md:hidden"
            style={{ top: "calc(env(safe-area-inset-top) + 2.5rem)" }}
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
              <SearchPanel workspaceId={workspaceId} onSelect={handleSelect} autoFocus={false} inputRef={inputRef} />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
