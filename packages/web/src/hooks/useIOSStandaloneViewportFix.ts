import { useEffect } from "react";
import { isIOS } from "../lib/platform.js";

const RELOADED_FLAG = "notorious:ios-standalone-viewport-fix-reloaded";

function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

/**
 * On a cold launch (tapping the home-screen icon), iOS's WKWebView can size
 * its content view several dozen points shorter than the real screen for an
 * installed standalone PWA. Confirmed on a real device via an on-screen
 * debug badge: window.innerHeight read 894 against a real
 * window.screen.height of 956 - a stable 62pt shortfall that didn't budge
 * over several seconds of repeated polling, so this isn't a "hasn't settled
 * yet" race (see useDynamicViewportHeight.ts, which tried exactly that and
 * didn't fix it) - WKWebView just doesn't redo this layout without an actual
 * page navigation. A manual pull-to-refresh (usePullToRefresh.ts, itself
 * just a reload) is what was originally used to diagnose it and reliably
 * fixes it; this does the same reload automatically, once.
 *
 * Compares window.screen.height directly against window.innerHeight - NOT
 * innerHeight + the safe-area insets, which a previous version of this
 * check did. Under viewport-fit=cover the insets describe regions *inside*
 * innerHeight, not extra space on top of it, so adding them on made the
 * measured value look erroneously larger than screen.height and the
 * threshold below never tripped - the bug this device's numbers exposed.
 */
export function useIOSStandaloneViewportFix(): void {
  useEffect(() => {
    if (!isIOS() || !isStandalone()) return;
    if (sessionStorage.getItem(RELOADED_FLAG)) return;

    function check() {
      // A few points of slack for normal rounding - only reload for a real,
      // multi-point mismatch, not floating-point noise.
      if (window.screen.height - window.innerHeight > 8) {
        sessionStorage.setItem(RELOADED_FLAG, "1");
        window.location.reload();
      }
    }

    // Give WKWebView a moment first - checking on the very first paint would
    // catch it mid-transition even in an already-correcting-itself case.
    const timer = setTimeout(check, 400);
    return () => clearTimeout(timer);
  }, []);
}
