import { useMutation, useQueryClient } from "@tanstack/react-query";
import { objectApi } from "../lib/api/resources.js";
import { useDeleteObject } from "./useDeleteObject.js";

/**
 * Lock/archive/restore/delete mutations for a sidebar/rail row's context
 * menu - shared across PinnedNavItem/RecentNavItem/RecentlyEditedNavItem so
 * the invalidation logic isn't tripled (same reasoning as useDeleteObject.ts,
 * which this wraps for the delete case).
 */
export function useObjectRowActions(workspaceId: string, objectId: string) {
  const queryClient = useQueryClient();

  function invalidate() {
    void queryClient.invalidateQueries({ queryKey: ["object", objectId] });
    void queryClient.invalidateQueries({ queryKey: ["objects", workspaceId] });
  }

  const lockMutation = useMutation({
    mutationFn: (locked: boolean) => objectApi.setLocked(objectId, { locked }),
    onSuccess: invalidate,
  });
  const archiveMutation = useMutation({ mutationFn: () => objectApi.archive(objectId), onSuccess: invalidate });
  const restoreMutation = useMutation({ mutationFn: () => objectApi.restore(objectId), onSuccess: invalidate });
  const { deleteObject, isDeleting } = useDeleteObject(workspaceId, objectId);

  return {
    setLocked: (locked: boolean) => lockMutation.mutate(locked),
    archive: () => archiveMutation.mutate(),
    restore: () => restoreMutation.mutate(),
    deleteObject,
    isDeleting,
  };
}
