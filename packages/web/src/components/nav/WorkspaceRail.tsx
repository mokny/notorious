import { useMemo, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Workspace } from "@notorious/shared";
import { workspaceApi } from "../../lib/api/resources.js";
import { useReorderWorkspaces } from "../../hooks/useReorderWorkspaces.js";
import { useWorkspaceUnreadCounts } from "../../hooks/useWorkspaceUnreadCounts.js";
import { useDragSelectGuard } from "../../hooks/useDragSelectGuard.js";
import { useWorkspaceRole } from "../../hooks/useWorkspaceRole.js";
import { useObjectRowContextMenu } from "../../hooks/useObjectRowContextMenu.js";
import { ContextMenu, type ContextMenuEntry } from "../ui/ContextMenu.js";
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
  const unreadCounts = useWorkspaceUnreadCounts(activeWorkspaceId);
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
                unreadCount={unreadCounts[workspace.id] ?? 0}
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
  unreadCount: number;
  onNavigate: () => void;
  onTouchArmStart: (event: PointerEvent) => void;
}

/**
 * Right-click only (no hover "..." button - see grill-me spec, the rail is
 * too narrow at w-16 for a second icon per row). Rename happens inline: the
 * icon button itself swaps for a text input rather than opening a separate
 * dialog, closest match to "transform the row into an editable field" for
 * something this compact.
 */
function RailWorkspaceButton({ workspace, isActive, unreadCount, onNavigate, onTouchArmStart }: RailWorkspaceButtonProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: workspace.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const rowMenu = useObjectRowContextMenu();
  const { canEdit, isOwner } = useWorkspaceRole(workspace.id);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(workspace.name);

  const renameMutation = useMutation({
    mutationFn: (name: string) => workspaceApi.update(workspace.id, { name }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
  });

  function startRename() {
    setRenameValue(workspace.name);
    setRenaming(true);
  }

  function commitRename() {
    setRenaming(false);
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== workspace.name) renameMutation.mutate(trimmed);
  }

  function handleRenameKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") event.currentTarget.blur();
    else if (event.key === "Escape") {
      setRenameValue(workspace.name);
      setRenaming(false);
    }
  }

  const items: ContextMenuEntry[] = [
    ...(canEdit ? [{ key: "rename", label: t("nav.railContextMenu.rename"), icon: "pencil", onSelect: startRename }] : []),
    {
      key: "settings",
      label: t("nav.railContextMenu.workspaceSettings"),
      icon: "settings",
      onSelect: () => navigate(`/w/${workspace.id}/settings/general`),
    },
    {
      key: "invite",
      label: t("nav.railContextMenu.inviteMembers"),
      icon: "user-plus",
      onSelect: () => navigate(`/w/${workspace.id}/settings/members`),
    },
    ...(isOwner
      ? ([
          { key: "sep-delete", separator: true },
          {
            key: "delete",
            label: t("nav.railContextMenu.deleteWorkspace"),
            icon: "trash",
            danger: true,
            // Deliberately just links to the danger-zone tab rather than deleting inline from
            // here - see grill-me spec: deleting a workspace is the single most destructive
            // action in the app, not something a two-click right-click menu should shortcut.
            onSelect: () => navigate(`/w/${workspace.id}/settings/danger-zone`),
          },
        ] satisfies ContextMenuEntry[])
      : []),
  ];

  if (renaming) {
    return (
      <input
        ref={setNodeRef}
        style={style}
        autoFocus
        value={renameValue}
        onChange={(event) => setRenameValue(event.target.value)}
        onBlur={commitRename}
        onKeyDown={handleRenameKeyDown}
        className="h-10 w-14 shrink-0 rounded-xl border border-accent bg-surface px-1 text-center text-xs text-ink outline-none"
      />
    );
  }

  return (
    <>
      <button
        ref={setNodeRef}
        style={style}
        {...attributes}
        {...listeners}
        onPointerDownCapture={onTouchArmStart}
        onClick={onNavigate}
        onContextMenu={rowMenu.openFromMouseEvent}
        title={workspace.name}
        className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition ${
          isActive ? "bg-accent/15 text-accent" : "text-ink-muted hover:bg-surface-raised hover:text-ink"
        }`}
      >
        <Icon name={workspace.icon} className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {rowMenu.position && <ContextMenu x={rowMenu.position.x} y={rowMenu.position.y} items={items} onClose={rowMenu.close} />}
    </>
  );
}
