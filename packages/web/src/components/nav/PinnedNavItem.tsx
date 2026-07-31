import { useMemo, useState } from "react";
import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { blockApi, objectApi } from "../../lib/api/resources.js";
import { useObjectTitle } from "../../hooks/useObjectTitle.js";
import { useWorkspacePins } from "../../hooks/useWorkspacePins.js";
import { isSharedSession } from "../../lib/api/shareMode.js";
import { Icon } from "../ui/Icon.js";
import { navLinkClass } from "./navLinkClass.js";

interface PinnedNavItemProps {
  workspaceId: string;
  objectId: string;
}

/**
 * One pinned object in the sidebar. If it has sub-objects (the universal
 * "sub_objects" relation every object type has - see
 * modules/schema/subObjects.ts server-side) they are reachable via the
 * expand chevron, without leaving the sidebar. Drag-reorderable via the grip
 * handle (see the DndContext wrapping the pinned list in WorkspaceLayout).
 */
export function PinnedNavItem({ workspaceId, objectId }: PinnedNavItemProps) {
  const [expanded, setExpanded] = useState(false);
  const { title, icon } = useObjectTitle(workspaceId, objectId);
  const { toggle: togglePin } = useWorkspacePins(workspaceId);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: objectId });

  const { data: object } = useQuery({
    queryKey: ["object", objectId],
    queryFn: () => objectApi.get(objectId),
  });
  const subObjectIds = useMemo(
    () => (Array.isArray(object?.values.sub_objects) ? object.values.sub_objects : []),
    [object?.values.sub_objects],
  );
  const hasSubObjects = subObjectIds.length > 0;

  // `subObjectIds` (the "sub_objects" relation) has no inherent order of its
  // own - only fetched once actually expanded, since it's extra work most
  // pinned rows never need. Sub-objects embedded as a block in this object's
  // own content sort by that block's position, matching the order you'd
  // actually see scrolling through the object itself; any relation without a
  // corresponding block (added by hand via SubObjectsPanel) keeps its
  // original relative order, appended after the block-ordered ones.
  const { data: blocks } = useQuery({
    queryKey: ["blocks", objectId],
    queryFn: () => blockApi.list(objectId),
    enabled: expanded && hasSubObjects,
  });
  const orderedSubObjectIds = useMemo(() => {
    if (!blocks) return subObjectIds;
    const blockOrder = blocks
      .filter((block) => block.type === "sub_object")
      .map((block) => (block.content as { objectId?: string }).objectId)
      .filter((id): id is string => Boolean(id) && subObjectIds.includes(id!));
    const remaining = subObjectIds.filter((id) => !blockOrder.includes(id));
    return [...blockOrder, ...remaining];
  }, [blocks, subObjectIds]);

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  // Curating the shared pin list needs real editor+ membership server-side
  // (see workspaces/routes.ts) - hidden here rather than left to fail on
  // click, same policy as the pin button on ObjectDetailPage.
  const canCurate = !isSharedSession();

  return (
    <div ref={setNodeRef} style={style}>
      <div className="group flex items-center gap-0.5 rounded-lg pr-1 hover:bg-surface">
        {canCurate && (
          <button
            {...attributes}
            {...listeners}
            className="shrink-0 cursor-grab rounded p-1 text-ink-muted opacity-0 hover:text-ink group-hover:opacity-100"
            title="Drag to reorder"
          >
            <Icon name="grip-vertical" className="h-3 w-3" />
          </button>
        )}
        <button
          onClick={() => setExpanded((v) => !v)}
          className={`shrink-0 rounded p-1 text-ink-muted hover:text-ink ${hasSubObjects ? "" : "invisible"}`}
          title="Show sub-objects"
        >
          <Icon name={expanded ? "chevron-down" : "chevron-right"} className="h-3 w-3" />
        </button>
        <NavLink to={`/w/${workspaceId}/objects/${objectId}`} className={({ isActive }) => navLinkClass(isActive) + " flex-1"}>
          <Icon name={icon} className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{title}</span>
        </NavLink>
        {canCurate && (
          <button
            onClick={() => togglePin(objectId)}
            className="shrink-0 rounded p-1 text-ink-muted opacity-0 hover:text-red-500 group-hover:opacity-100"
            title="Unpin"
          >
            <Icon name="pin-off" className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {expanded && hasSubObjects && (
        <div className="ml-4 space-y-0.5 border-l border-border pl-2">
          {orderedSubObjectIds.map((subObjectId) => (
            <SubObjectRow key={subObjectId} workspaceId={workspaceId} objectId={subObjectId} />
          ))}
        </div>
      )}
    </div>
  );
}

function SubObjectRow({ workspaceId, objectId }: { workspaceId: string; objectId: string }) {
  const { title, icon } = useObjectTitle(workspaceId, objectId);
  return (
    <NavLink to={`/w/${workspaceId}/objects/${objectId}`} className={({ isActive }) => navLinkClass(isActive, "text-xs")}>
      <Icon name={icon} className="h-3 w-3 shrink-0" />
      <span className="truncate">{title}</span>
    </NavLink>
  );
}
