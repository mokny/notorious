import { arrayMove } from "@dnd-kit/sortable";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { workspaceApi } from "../lib/api/resources.js";

/**
 * Objects pinned to the sidebar - a workspace-wide "quick navigation" list
 * (server-backed, like the dashboard object) that every member *and* an
 * anonymous whole-workspace share visitor sees the same version of, not a
 * personal per-account preference. `toggle`/`reorder` only ever actually get
 * called from UI that's already hidden for anyone without edit rights (see
 * ObjectDetailPage.tsx's pin button) - the server enforces the real "editor+"
 * boundary regardless.
 */
export function useWorkspacePins(workspaceId: string | undefined) {
  const queryClient = useQueryClient();
  const enabled = Boolean(workspaceId);
  const queryKey = ["pins", workspaceId];

  const { data: pinnedIds = [] } = useQuery({
    queryKey,
    queryFn: () => workspaceApi.pins(workspaceId!),
    enabled,
  });

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey });
  }

  const pinMutation = useMutation({
    mutationFn: (objectId: string) => workspaceApi.pin(workspaceId!, objectId),
    onSuccess: invalidate,
  });
  const unpinMutation = useMutation({
    mutationFn: (objectId: string) => workspaceApi.unpin(workspaceId!, objectId),
    onSuccess: invalidate,
  });
  const moveMutation = useMutation({
    mutationFn: ({ objectId, afterObjectId }: { objectId: string; afterObjectId: string | null }) =>
      workspaceApi.movePin(workspaceId!, objectId, afterObjectId),
    onSuccess: invalidate,
  });

  function isPinned(objectId: string): boolean {
    return pinnedIds.includes(objectId);
  }

  function toggle(objectId: string): void {
    if (!enabled) return;
    if (isPinned(objectId)) unpinMutation.mutate(objectId);
    else pinMutation.mutate(objectId);
  }

  /** `overId` is just "which slot the pointer is over now" - reordering the current list the same way dnd-kit's own list does (`arrayMove`) and reading off the dragged item's new predecessor gives the correct side regardless of drag direction (same reasoning as BlockEditor.tsx's handleDragEnd). */
  function reorder(activeId: string, overId: string): void {
    if (!enabled) return;
    const oldIndex = pinnedIds.indexOf(activeId);
    const newIndex = pinnedIds.indexOf(overId);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(pinnedIds, oldIndex, newIndex);
    const draggedIndex = reordered.indexOf(activeId);
    const afterObjectId = draggedIndex > 0 ? reordered[draggedIndex - 1]! : null;
    moveMutation.mutate({ objectId: activeId, afterObjectId });
  }

  return { pinnedIds, isPinned, toggle, reorder };
}
