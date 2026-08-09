import { useEffect } from "react";
import { isIOS, isStandalone } from "../lib/platform.js";

const SHRINK_THRESHOLD_PX = 8;
const RELOAD_COUNT_KEY = "notorious:viewport-reload-count";
// Caps retries within a single boot, not "ever" - a permanent flag turned
// out to survive an installed PWA being backgrounded and reopened (iOS
// suspends rather than fully restarts the WKWebView process much of the
// time), silently no-opping on every later cold launch. Self-terminating
// anyway, since a successful reload closes the mismatch.
const MAX_AUTO_RELOADS = 2;

function expectedHeight(): number {
  return window.innerWidth > window.innerHeight ? window.screen.width : window.screen.height;
}

/**
 * On a cold launch of the installed iOS PWA, WKWebView sometimes settles on
 * a `window.innerHeight`/`visualViewport.height`/the `dvh` unit several
 * dozen px shorter than the real screen (confirmed live on-device via a
 * temporary debug overlay: innerHeight=894 against screen.height=956, off
 * by exactly the measured safe-area-inset-top - WKWebView's actual render
 * surface is genuinely that much shorter, not just a wrong JS number, so no
 * CSS/JS trick run from inside the page can stretch it - position: fixed;
 * inset: 0 resolves against that same short surface). A real
 * `location.reload()` is the only thing that's been found to force WKWebView
 * to redo this measurement (confirmed both here and via this project's own
 * interactive on-device debug-panel testing in an earlier round of this same
 * investigation - see git log for useDynamicViewportHeight.ts). Does NOT fix
 * the separate keyboard-triggered permanent shrink (reload doesn't help
 * that one either, per that same testing) - only the cold-launch case.
 */
export function useIOSStandaloneViewportReload(): void {
  useEffect(() => {
    if (!isIOS() || !isStandalone()) return;

    function check() {
      if (expectedHeight() - window.innerHeight <= SHRINK_THRESHOLD_PX) return;
      const count = Number(sessionStorage.getItem(RELOAD_COUNT_KEY) ?? "0");
      if (count >= MAX_AUTO_RELOADS) return;
      sessionStorage.setItem(RELOAD_COUNT_KEY, String(count + 1));
      window.location.reload();
    }

    check();
    // Also re-checks when the app is resumed from the background - iOS
    // usually suspends rather than fully restarts a backgrounded PWA (so a
    // fresh `check()` on mount alone wouldn't catch a mismatch that only
    // appears on resume), and `pageshow`/`visibilitychange` cover both the
    // bfcache-restore and plain-tab-switch-back cases.
    function onResume() {
      if (document.visibilityState === "visible") check();
    }
    window.addEventListener("pageshow", check);
    document.addEventListener("visibilitychange", onResume);
    return () => {
      window.removeEventListener("pageshow", check);
      document.removeEventListener("visibilitychange", onResume);
    };
  }, []);
}
