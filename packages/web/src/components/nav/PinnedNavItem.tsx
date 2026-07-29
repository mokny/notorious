import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { objectApi } from "../../lib/api/resources.js";
import { useObjectTitle } from "../../hooks/useObjectTitle.js";
import { useWorkspacePins } from "../../hooks/useWorkspacePins.js";
import { Icon } from "../ui/Icon.js";
import { navLinkClass } from "./navLinkClass.js";

interface PinnedNavItemProps {
  workspaceId: string;
  objectId: string;
}

/**
 * One pinned object in the sidebar. If it has "sub-objects" (anything that
 * links back to it - the same relation data the Backlinks panel uses) they
 * are reachable via the expand chevron, without leaving the sidebar.
 */
export function PinnedNavItem({ workspaceId, objectId }: PinnedNavItemProps) {
  const [expanded, setExpanded] = useState(false);
  const { title, icon } = useObjectTitle(objectId);
  const { toggle: togglePin } = useWorkspacePins(workspaceId);

  const { data: subObjects } = useQuery({
    queryKey: ["backlinks", objectId],
    queryFn: () => objectApi.backlinks(objectId),
  });
  const hasSubObjects = Boolean(subObjects && subObjects.length > 0);

  return (
    <div>
      <div className="group flex items-center gap-0.5 rounded-lg pr-1 hover:bg-surface">
        <button
          onClick={() => setExpanded((v) => !v)}
          className={`shrink-0 rounded p-1 text-ink-muted hover:text-ink ${hasSubObjects ? "" : "invisible"}`}
          title="Show sub-objects"
        >
          <Icon name={expanded ? "chevron-down" : "chevron-right"} className="h-3 w-3" />
        </button>
        <NavLink to={`/w/${workspaceId}/objects/${objectId}`} className={({ isActive }) => navLinkClass(isActive) + " flex-1"}>
          <Icon name={icon ?? "file-text"} className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{title}</span>
        </NavLink>
        <button
          onClick={() => togglePin(objectId)}
          className="shrink-0 rounded p-1 text-ink-muted opacity-0 hover:text-red-500 group-hover:opacity-100"
          title="Unpin"
        >
          <Icon name="pin-off" className="h-3.5 w-3.5" />
        </button>
      </div>

      {expanded && hasSubObjects && (
        <div className="ml-4 space-y-0.5 border-l border-border pl-2">
          {subObjects!.map((sub) => (
            <NavLink
              key={sub.id}
              to={`/w/${workspaceId}/objects/${sub.id}`}
              className={({ isActive }) => navLinkClass(isActive, "text-xs")}
            >
              <Icon name={sub.icon ?? "file-text"} className="h-3 w-3 shrink-0" />
              <span className="truncate">{sub.title}</span>
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}
