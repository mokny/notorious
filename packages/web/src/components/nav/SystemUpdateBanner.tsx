import { useTranslation } from "react-i18next";
import { Icon } from "../ui/Icon.js";
import { useSystemUpdateStatus } from "../../lib/ws/useSystemUpdateStatus.js";

/**
 * App-wide fixed top banner for an admin-triggered update/restart (see
 * AdminUpdateTab.tsx) - mounted once in App.tsx alongside `AppRoutes`, not
 * inside `WorkspaceLayout`, so it renders on every route including the
 * login page and anonymous share links (see `useSystemUpdateStatus.ts`'s doc
 * comment for the full state machine). `z-50` deliberately sits above every
 * other fixed-position layer in the app (WorkspaceLayout's sidebar scrim is
 * z-30, its mobile header z-40) - this is the one thing that should never be
 * covered by anything else.
 *
 * Below `md` (matching `MobileTopBar.tsx`'s own `md:hidden`), `top` is
 * pushed down by that floating pill header's height instead of sitting at
 * `top-0` - being *above* it z-index-wise still isn't enough on a phone,
 * since the header's pills are the same row: without this offset the banner
 * text renders directly behind/through them rather than in its own row.
 * Same height expression as `WorkspaceLayout.tsx`'s `MOBILE_TOP_BAR_HEIGHT`
 * (not imported from there - that constant isn't exported, and duplicating
 * one calc() string is simpler than exporting it for a single use here).
 */
export function SystemUpdateBanner() {
  const { t } = useTranslation();
  const { phase, reason, countdown, dismiss } = useSystemUpdateStatus();

  if (phase === "idle") return null;

  const dismissible = phase === "failed" || phase === "stuck";
  const message =
    phase === "inProgress"
      ? t(reason === "restart" ? "nav.systemUpdateBanner.inProgressRestart" : "nav.systemUpdateBanner.inProgressUpdate")
      : phase === "finishing"
        ? t("nav.systemUpdateBanner.finishing", { seconds: countdown })
        : phase === "failed"
          ? t("nav.systemUpdateBanner.failed")
          : t("nav.systemUpdateBanner.stuck");

  return (
    <div className="fixed inset-x-0 top-[calc(env(safe-area-inset-top)+3.5rem)] z-50 flex items-center justify-center gap-2 border-b border-red-700 bg-red-600 px-3 py-2 text-center text-xs font-medium text-white md:top-0">
      <Icon name={dismissible ? "alert-triangle" : "refresh"} className={`h-4 w-4 shrink-0 ${phase === "inProgress" || phase === "finishing" ? "animate-spin" : ""}`} />
      <span>{message}</span>
      {dismissible && (
        <button onClick={dismiss} title={t("nav.systemUpdateBanner.dismiss")} className="ml-1 shrink-0 rounded-md p-1 hover:bg-white/10">
          <Icon name="close" className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
