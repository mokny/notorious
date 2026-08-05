import { useSyncExternalStore } from "react";

export type Breakpoint = "phone" | "tablet" | "desktop";

// Width-based, not device-sniffed - the same iPad, Android tablet, or resized
// desktop window lands in the same tier. `tablet` deliberately overlaps
// "landscape phone" widths too; nothing here treats that as a problem since
// the tablet-only layout (persistent sidebar, split view) is still a
// reasonable fit for a wide short window.
const PHONE_QUERY = "(max-width: 767px)";
const TABLET_QUERY = "(min-width: 768px) and (max-width: 1279px)";
const LANDSCAPE_QUERY = "(orientation: landscape)";

function subscribe(onChange: () => void) {
  const queries = [PHONE_QUERY, TABLET_QUERY, LANDSCAPE_QUERY].map((q) => matchMedia(q));
  queries.forEach((mql) => mql.addEventListener("change", onChange));
  return () => queries.forEach((mql) => mql.removeEventListener("change", onChange));
}

function getBreakpoint(): Breakpoint {
  if (matchMedia(PHONE_QUERY).matches) return "phone";
  if (matchMedia(TABLET_QUERY).matches) return "tablet";
  return "desktop";
}

function getIsLandscape(): boolean {
  return matchMedia(LANDSCAPE_QUERY).matches;
}

export function useBreakpoint(): Breakpoint {
  return useSyncExternalStore(subscribe, getBreakpoint, () => "desktop");
}

/** True only for the tablet tier in landscape - the "wide enough for sidebar + list + detail" case. */
export function useIsLandscape(): boolean {
  return useSyncExternalStore(subscribe, getIsLandscape, () => true);
}
