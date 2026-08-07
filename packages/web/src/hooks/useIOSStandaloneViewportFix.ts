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
 * On a cold launch (tapping the home-screen icon), iOS's WKWebView
 * sometimes reports a viewport a bit shorter than the real screen for the
 * installed PWA - `window.innerHeight` (and `env(safe-area-inset-*)`) don't
 * yet include the safe areas it hasn't finished settling into, so anything
 * relying on them (WorkspaceLayout.tsx's mobile header, BottomTabBar's own
 * bottom padding) ends up with an oversized, wrongly-colored gap at the true
 * edges. It self-corrects, but only once *something* forces the page to
 * re-read those values - a manual pull-to-refresh reload (usePullToRefresh)
 * happens to do exactly that, which is how this was diagnosed. This does
 * the same thing automatically, once, only when the numbers actually don't
 * add up - not a blind reload-every-launch workaround.
 */
export function useIOSStandaloneViewportFix(): void {
  useEffect(() => {
    if (!isIOS() || !isStandalone()) return;
    if (sessionStorage.getItem(RELOADED_FLAG)) return;

    function check() {
      const sat = getSafeAreaInset("top");
      const sab = getSafeAreaInset("bottom");
      const measured = window.innerHeight + sat + sab;
      // A few px of slack for normal rounding - only reload for a real,
      // multi-pixel mismatch, not floating-point noise.
      if (window.screen.height - measured > 8) {
        sessionStorage.setItem(RELOADED_FLAG, "1");
        window.location.reload();
      }
    }

    // Give the WKWebView a moment to settle on its own first - checking on
    // the very first paint would catch it mid-transition even in the
    // already-correcting-itself case.
    const timer = setTimeout(check, 400);
    return () => clearTimeout(timer);
  }, []);
}

function getSafeAreaInset(side: "top" | "bottom"): number {
  const probe = document.createElement("div");
  probe.style.cssText = `position:fixed;${side}:0;height:env(safe-area-inset-${side});visibility:hidden;pointer-events:none;`;
  document.body.appendChild(probe);
  const value = probe.getBoundingClientRect().height;
  document.body.removeChild(probe);
  return value;
}
