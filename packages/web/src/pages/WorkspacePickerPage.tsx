import { useMemo, useState, type FormEvent, type PointerEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { DndContext, MouseSensor, TouchSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Workspace } from "@notorious/shared";
import { workspaceApi } from "../lib/api/resources.js";
import { useAuth } from "../context/AuthContext.js";
import { useReorderWorkspaces } from "../hooks/useReorderWorkspaces.js";
import { useWorkspaceUnreadCounts } from "../hooks/useWorkspaceUnreadCounts.js";
import { useDragSelectGuard } from "../hooks/useDragSelectGuard.js";
import { Button } from "../components/ui/Button.js";
import { TextField } from "../components/ui/TextField.js";
import { Icon } from "../components/ui/Icon.js";

export function WorkspacePickerPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");

  const { data: workspaces } = useQuery({ queryKey: ["workspaces"], queryFn: workspaceApi.list });
  const workspaceIds = useMemo(() => workspaces?.map((workspace) => workspace.id) ?? [], [workspaces]);
  const { reorder } = useReorderWorkspaces();
  // No workspace is "active" here (this page sits outside any /w/:id route) - every
  // workspace gets its own background live-count socket, see the hook's own doc comment.
  const unreadCounts = useWorkspaceUnreadCounts(undefined);
  const dragSelectGuard = useDragSelectGuard();
  // Same mouse-distance / touch-long-press split as WorkspaceRail.tsx - see
  // that file's doc comment.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  function handleDragEnd(event: DragEndEvent) {
    dragSelectGuard.onDragEnd();
    if (!event.over || event.active.id === event.over.id) return;
    reorder(workspaceIds, String(event.active.id), String(event.over.id));
  }

  const createWorkspace = useMutation({
    mutationFn: () => workspaceApi.create({ name: name || t("workspacePicker.untitledWorkspace"), icon: "sparkles" }),
    onSuccess: async (workspace) => {
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      openWorkspace(workspace.id);
    },
  });

  // WorkspaceHome (the index route for "/w/:id") decides where that actually
  // lands - the workspace's dashboard object if one is set, otherwise the
  // same "first object type" fallback this used to compute here directly.
  function openWorkspace(workspaceId: string) {
    navigate(`/w/${workspaceId}`);
  }

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    createWorkspace.mutate();
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <img src="/logo.png" alt="" className="mb-6 h-16 w-16 rounded-2xl" />
      <h1 className="text-2xl font-semibold">{t("workspacePicker.greeting", { name: user?.name?.split(" ")[0] })}</h1>
      <p className="mt-1 text-sm text-ink-muted">{t("workspacePicker.subtitle")}</p>

      <div className="mt-8 space-y-2">
        <DndContext
          sensors={sensors}
          onDragStart={dragSelectGuard.onDragStart}
          onDragCancel={dragSelectGuard.onDragCancel}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={workspaceIds} strategy={verticalListSortingStrategy}>
            {workspaces?.map((workspace) => (
              <PickerWorkspaceButton
                key={workspace.id}
                workspace={workspace}
                unreadCount={unreadCounts[workspace.id] ?? 0}
                onOpen={() => openWorkspace(workspace.id)}
                onTouchArmStart={dragSelectGuard.onTouchArmStart}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>

      <form onSubmit={handleCreate} className="mt-8 flex gap-2">
        <TextField placeholder={t("workspacePicker.newWorkspaceNamePlaceholder")} value={name} onChange={(e) => setName(e.target.value)} />
        <Button type="submit" variant="primary" disabled={createWorkspace.isPending}>
          <Icon name="plus" /> {t("workspacePicker.create")}
        </Button>
      </form>
    </div>
  );
}

interface PickerWorkspaceButtonProps {
  workspace: Workspace;
  unreadCount: number;
  onOpen: () => void;
  onTouchArmStart: (event: PointerEvent) => void;
}

function PickerWorkspaceButton({ workspace, unreadCount, onOpen, onTouchArmStart }: PickerWorkspaceButtonProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: workspace.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onPointerDownCapture={onTouchArmStart}
      onClick={onOpen}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-raised p-4 text-left transition hover:ring-2 hover:ring-accent/30"
    >
      <Icon name={workspace.icon} className="h-5 w-5 text-accent" />
      <span className="flex-1 font-medium">{workspace.name}</span>
      {unreadCount > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-xs font-semibold leading-none text-white">
          {unreadCount > 9 ? "9+" : unreadCount}
        </span>
      )}
    </button>
  );
}
