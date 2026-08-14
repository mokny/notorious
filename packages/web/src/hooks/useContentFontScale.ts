import { useEffect } from "react";
import { useAuth } from "../context/AuthContext.js";
import { useBreakpoint } from "./useBreakpoint.js";

/**
 * Applies the user's content-area font-size preference (Settings > Profile >
 * "Darstellung") as `--content-font-scale` on `<html>` - read by the
 * `.content-scale`-scoped overrides in styles/globals.css, which every block
 * editor (BlockEditor.tsx) and view (ViewRenderer.tsx) instance is wrapped
 * in. Picks the mobile or desktop value based on `useBreakpoint()` (phone ->
 * mobile, tablet/desktop -> desktop) - not which device the value was set
 * from, so switching to a narrower window applies the mobile value live.
 * Mounted once at the app root (see App.tsx) so it's live regardless of
 * which route is open.
 */
export function useContentFontScale(): void {
  const { user } = useAuth();
  const breakpoint = useBreakpoint();

  useEffect(() => {
    const percent = breakpoint === "phone" ? (user?.contentFontSizeMobile ?? 100) : (user?.contentFontSizeDesktop ?? 100);
    document.documentElement.style.setProperty("--content-font-scale", String(percent / 100));
  }, [breakpoint, user?.contentFontSizeMobile, user?.contentFontSizeDesktop]);
}
