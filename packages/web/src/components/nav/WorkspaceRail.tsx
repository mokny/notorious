import { useMemo, useState, type PointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useQuery } from "@tanstack/react-query";
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Workspace } from "@notorious/shared";
import { workspaceApi } from "../../lib/api/resources.js";
import { useReorderWorkspaces } from "../../hooks/useReorderWorkspaces.js";
import { useDragSelectGuard } from "../../hooks/useDragSelectGuard.js";
import { Icon } from "../ui/Icon.js";
import { AccountMenuButton } from "./AccountMenuButton.js";
import { CreateWorkspaceDialog } from "./CreateWorkspaceDialog.js";

interface WorkspaceRailProps {
  activeWorkspaceId: string;
}

/**
 * Notion-desktop-style far-left icon rail - desktop breakpoint only (see
 * WorkspaceLayout.tsx). Lists every workspace the user belongs to, switching
 * between them in place (no more navigating through WorkspacePickerPage on
 * this breakpoint), plus a "+" to create one and the account menu at the
 * bottom. Drag-reorderable (see useReorderWorkspaces.ts) - no separate grip
 * handle like PinnedNavItem.tsx, the icon button itself is the drag source,
 * distinguished from a click by dnd-kit's own activation constraint below.
 */
export function WorkspaceRail({ activeWorkspaceId }: WorkspaceRailProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: workspaces } = useQuery({ queryKey: ["workspaces"], queryFn: workspaceApi.list });
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const workspaceIds = useMemo(() => workspaces?.map((workspace) => workspace.id) ?? [], [workspaces]);
  const { reorder } = useReorderWorkspaces();
  const dragSelectGuard = useDragSelectGuard();
  // Mouse keeps the near-instant 4px-movement drag start; touch needs a
  // short long-press first (mirrors BlockEditor.tsx) so a plain tap doesn't
  // get mistaken for the start of a drag - there's no dedicated handle here,
  // the whole button is the drag source.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    dragSelectGuard.onDragEnd();
    if (!event.over || event.active.id === event.over.id) return;
    reorder(workspaceIds, String(event.active.id), String(event.over.id));
  }

  return (
    <aside
      // z-50, not z-0 - the sidebar `<aside>` next to this one is effectively
      // z-40 (see WorkspaceLayout.tsx), and since that's a sibling stacking
      // context, AccountMenuButton's own z-50 popup menu rendered *inside*
      // this rail would still lose to the entire sidebar sitting above it
      // otherwise - the popup's z-index only ranks within its own ancestor
      // context, not against siblings of that ancestor.
      className="relative z-50 flex w-16 shrink-0 flex-col items-center border-r border-border bg-surface"
      style={{
        paddingTop: "calc(0.75rem + env(safe-area-inset-top))",
        paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))",
      }}
    >
      <nav className="flex flex-1 flex-col items-center gap-1.5 overflow-y-auto">
        <DndContext
          sensors={sensors}
          onDragStart={dragSelectGuard.onDragStart}
          onDragCancel={dragSelectGuard.onDragCancel}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={workspaceIds} strategy={verticalListSortingStrategy}>
            {workspaces?.map((workspace) => (
              <RailWorkspaceButton
                key={workspace.id}
                workspace={workspace}
                isActive={workspace.id === activeWorkspaceId}
                onNavigate={() => navigate(`/w/${workspace.id}`)}
                onTouchArmStart={dragSelectGuard.onTouchArmStart}
              />
            ))}
          </SortableContext>
        </DndContext>
        <button
          onClick={() => setCreateDialogOpen(true)}
          title={t("workspacePicker.create")}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ink-muted hover:bg-surface-raised hover:text-ink"
        >
          <Icon name="plus" className="h-5 w-5" />
        </button>
      </nav>
      <AccountMenuButton workspaceId={activeWorkspaceId} variant="compact" side="top" />
      <CreateWorkspaceDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onCreated={(workspaceId) => navigate(`/w/${workspaceId}`)}
      />
    </aside>
  );
}

interface RailWorkspaceButtonProps {
  workspace: Workspace;
  isActive: boolean;
  onNavigate: () => void;
  onTouchArmStart: (event: PointerEvent) => void;
}

function RailWorkspaceButton({ workspace, isActive, onNavigate, onTouchArmStart }: RailWorkspaceButtonProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: workspace.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onPointerDownCapture={onTouchArmStart}
      onClick={onNavigate}
      title={workspace.name}
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
        isActive ? "bg-accent/15 text-accent" : "text-ink-muted hover:bg-surface-raised hover:text-ink"
      }`}
    >
      <Icon name={workspace.icon} className="h-5 w-5" />
    </button>
  );
}
