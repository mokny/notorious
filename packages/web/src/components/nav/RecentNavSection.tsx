import { NavLink } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useObjectTitle } from "../../hooks/useObjectTitle.js";
import { useRecentObjects } from "../../hooks/useRecentObjects.js";
import { usePersistedOpen } from "../../hooks/usePersistedOpen.js";
import { Icon } from "../ui/Icon.js";
import { navLinkClass } from "./navLinkClass.js";

/** Collapsible "recently viewed" list - the open/closed state itself is remembered. */
export function RecentNavSection({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const { recentIds } = useRecentObjects(workspaceId);
  const [open, setOpen] = usePersistedOpen(`recent-${workspaceId}`, true);

  if (recentIds.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium uppercase tracking-wide text-ink-muted hover:text-ink"
      >
        <Icon name={open ? "chevron-down" : "chevron-right"} className="h-3 w-3" />
        <Icon name="clock" className="h-3 w-3" />
        {t("nav.recentlyViewed")}
      </button>
      {open && (
        <div className="space-y-0.5">
          {recentIds.map((objectId) => (
            <RecentNavItem key={objectId} workspaceId={workspaceId} objectId={objectId} />
          ))}
        </div>
      )}
    </div>
  );
}

function RecentNavItem({ workspaceId, objectId }: { workspaceId: string; objectId: string }) {
  const { title, icon } = useObjectTitle(workspaceId, objectId);
  return (
    <div className="flex items-center gap-0.5 pr-1">
      {/* Matches PinnedNavItem's drag-handle + expand-chevron button widths
          (two h-5 w-5 slots), so recent/pinned rows line up under the same
          icon column instead of recent items sitting flush left of pinned
          ones. */}
      <span className="h-5 w-5 shrink-0" aria-hidden />
      <span className="h-5 w-5 shrink-0" aria-hidden />
      <NavLink to={`/w/${workspaceId}/objects/${objectId}`} className={({ isActive }) => navLinkClass(isActive) + " flex-1"}>
        <Icon name={icon} className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{title}</span>
      </NavLink>
    </div>
  );
}
