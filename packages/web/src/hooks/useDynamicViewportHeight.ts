import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { isIOS } from "../lib/platform.js";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

const SHRINK_THRESHOLD_PX = 8;
const RELOAD_COUNT_KEY = "notorious:viewport-reload-count";
// Caps retries within a single boot, not "ever" - a real per-tab-session
// sessionStorage flag (what an earlier version of this fix used) turned out
// to survive an installed PWA being backgrounded and reopened (iOS suspends
// rather than fully restarts the WKWebView process much of the time), so a
// one-shot-forever flag silently no-opped on every launch after the first
// and made it look like the reload itself didn't work - an interactive
// debug panel proved it does when nothing's blocking it. A small cap here
// instead just bounds the (self-terminating, since the mismatch is gone
// after a successful reload) retry loop against the possibility of a
// device/build where reloading genuinely never fixes it.
const MAX_AUTO_RELOADS = 2;

/**
 * How tall the viewport *should* be. window.screen.height is a genuinely
 * independent measurement from window.innerHeight/visualViewport.height/the
 * `dvh` unit - those are exactly the values this whole file exists because
 * iOS's WKWebView can report wrong. Falls back to screen.width in landscape,
 * where the shorter dimension is the relevant one.
 */
function expectedHeight(): number {
  return window.innerWidth > window.innerHeight ? window.screen.width : window.screen.height;
}

function publishAppVh(): void {
  document.documentElement.style.setProperty("--app-vh", `${window.innerHeight}px`);
}

/**
 * iOS's WKWebView has a well-documented standalone-PWA bug where
 * window.innerHeight/visualViewport.height/the `dvh` unit report several
 * dozen points shorter than the real screen (confirmed on a real device:
 * innerHeight=894 against a real screen.height=956) and it doesn't recover
 * on its own - not on blur, not on deleting and re-adding the home-screen
 * icon from scratch. An interactive on-device debug panel ruled out every
 * in-page trick that doesn't involve a real navigation (forcing a reflow by
 * toggling `display`, nudging every scrollable ancestor by a pixel and
 * back) - none of them budged it. A real `location.reload()` is the only
 * thing that does.
 */
export function useDynamicViewportHeight(): void {
  const location = useLocation();

  useEffect(() => {
    publishAppVh();

    function onResize() {
      publishAppVh();
    }
    window.addEventListener("resize", onResize);
    window.visualViewport?.addEventListener("resize", onResize);

    if (isIOS() && isStandalone() && expectedHeight() - window.innerHeight > SHRINK_THRESHOLD_PX) {
      const count = Number(sessionStorage.getItem(RELOAD_COUNT_KEY) ?? "0");
      if (count < MAX_AUTO_RELOADS) {
        sessionStorage.setItem(RELOAD_COUNT_KEY, String(count + 1));
        window.location.reload();
      }
    }

    return () => {
      window.removeEventListener("resize", onResize);
      window.visualViewport?.removeEventListener("resize", onResize);
    };
  }, [location.pathname]);
}
