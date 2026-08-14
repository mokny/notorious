import { arrayMove } from "@dnd-kit/sortable";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { workspaceApi } from "../lib/api/resources.js";

/**
 * Drag-reorders this user's own personal workspace list - the left rail
 * (WorkspaceRail.tsx) and WorkspacePickerPage share the same `["workspaces"]`
 * query and therefore the same order, so a single hook backs both. Mirrors
 * useWorkspacePins.ts's `reorder`, but personal to this user rather than
 * workspace-wide (see modules/workspaces/service.ts's `reorderWorkspace`), so
 * it takes the current id list as a parameter instead of owning its own
 * query - each caller already has its own `["workspaces"]` query for the
 * full `Workspace[]` it renders.
 */
export function useReorderWorkspaces() {
  const queryClient = useQueryClient();

  const moveMutation = useMutation({
    mutationFn: ({ workspaceId, afterWorkspaceId }: { workspaceId: string; afterWorkspaceId: string | null }) =>
      workspaceApi.reorder(workspaceId, afterWorkspaceId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["workspaces"] }),
  });

  /** `overId` is just "which slot the pointer is over now" - reordering the current list the same way dnd-kit's own list does (`arrayMove`) and reading off the dragged item's new predecessor gives the correct side regardless of drag direction (same reasoning as BlockEditor.tsx's handleDragEnd). */
  function reorder(workspaceIds: string[], activeId: string, overId: string): void {
    const oldIndex = workspaceIds.indexOf(activeId);
    const newIndex = workspaceIds.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(workspaceIds, oldIndex, newIndex);
    const draggedIndex = reordered.indexOf(activeId);
    const afterWorkspaceId = draggedIndex > 0 ? reordered[draggedIndex - 1]! : null;
    moveMutation.mutate({ workspaceId: activeId, afterWorkspaceId });
  }

  return { reorder };
}
