import { AnimatePresence, motion, type PanInfo } from "framer-motion";
import { useAuth } from "../../context/AuthContext.js";
import { useChatOverlay } from "../../context/ChatOverlayContext.js";
import { useBreakpoint } from "../../hooks/useBreakpoint.js";
import { useKeyboardInset } from "../../hooks/useKeyboardInset.js";
import { isSharedSession } from "../../lib/api/shareMode.js";
import { ChatPanel } from "./ChatPanel.js";

// Same feel as SearchSheet.tsx's own dismiss gesture.
const DISMISS_DISTANCE = 120;
const DISMISS_VELOCITY = 500;

/**
 * iOS-style slide-up chat sheet for the phone breakpoint - the mobile
 * counterpart to ChatBubble.tsx's desktop floating panel, same "overlay on
 * top of the current page, not a route" pattern as SearchSheet.tsx (see
 * ChatOverlayContext.tsx's doc comment for why: a bare full-page `/messages`
 * route used to trap phone users with no way back). Mounted once in App.tsx,
 * opened via MobileBottomBar's chat icon or a push-notification deep link
 * (ChatDeepLinkRoute.tsx).
 */
export function ChatSheet() {
  const { user } = useAuth();
  const breakpoint = useBreakpoint();
  const { isOpen, close } = useChatOverlay();
  const keyboardInset = useKeyboardInset();

  function handleDragEnd(_event: PointerEvent | MouseEvent | TouchEvent, info: PanInfo) {
    if (info.offset.y > DISMISS_DISTANCE || info.velocity.y > DISMISS_VELOCITY) close();
  }

  if (!user || isSharedSession() || breakpoint !== "phone") return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div className="fixed inset-0 z-40 bg-black/40" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={close} />
          <motion.div
            className="fixed inset-x-0 z-40 flex flex-col rounded-t-2xl bg-surface shadow-2xl"
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
            {/* Fixed 1rem, not env(safe-area-inset-bottom) - that's always 0
                without viewport-fit=cover (see index.html), so it was
                leaving the composer's input row right against the true
                bottom edge, barely reachable. */}
            <div className="min-h-0 flex-1 overflow-hidden pb-4">
              <ChatPanel />
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
