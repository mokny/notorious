import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { workspaceApi } from "../../lib/api/resources.js";
import { useObjectTitle } from "../../hooks/useObjectTitle.js";
import { usePersistedOpen } from "../../hooks/usePersistedOpen.js";
import { Icon } from "../ui/Icon.js";
import { navLinkClass } from "./navLinkClass.js";

/**
 * Collapsible "recently edited" list - server-side truth about what this
 * user actually *changed* (object/property/block edits, via the activity
 * log), as opposed to RecentNavSection's purely local "recently viewed"
 * list of what was opened on this device.
 */
export function RecentlyEditedNavSection({ workspaceId }: { workspaceId: string }) {
  const { t } = useTranslation();
  const { data: recentIds } = useQuery({
    queryKey: ["recentEdits", workspaceId],
    queryFn: () => workspaceApi.recentEdits(workspaceId),
  });
  const [open, setOpen] = usePersistedOpen(`recent-edited-${workspaceId}`, true);

  if (!recentIds || recentIds.length === 0) return null;

  return (
    <div className="mt-3">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-medium uppercase tracking-wide text-ink-muted hover:text-ink"
      >
        <Icon name={open ? "chevron-down" : "chevron-right"} className="h-3 w-3" />
        <Icon name="pencil" className="h-3 w-3" />
        {t("nav.recentlyEdited")}
      </button>
      {open && (
        <div className="space-y-0.5">
          {recentIds.map((objectId) => (
            <RecentlyEditedNavItem key={objectId} workspaceId={workspaceId} objectId={objectId} />
          ))}
        </div>
      )}
    </div>
  );
}

function RecentlyEditedNavItem({ workspaceId, objectId }: { workspaceId: string; objectId: string }) {
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
