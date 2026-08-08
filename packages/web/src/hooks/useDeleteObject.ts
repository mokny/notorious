import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { objectApi } from "../lib/api/resources.js";
import { useConfirm } from "../context/ConfirmContext.js";

/**
 * Shared "delete this object, then navigate back to the workspace" flow -
 * originally inline in ObjectDetailPage.tsx, extracted so the floating
 * mobile header's "..." menu (MobileTopBar.tsx) can offer the same action
 * without duplicating the confirm copy/mutation/invalidation logic.
 */
export function useDeleteObject(workspaceId: string | undefined, objectId: string | undefined) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const confirm = useConfirm();

  const deleteMutation = useMutation({
    mutationFn: () => objectApi.remove(objectId!),
    onSuccess: async () => {
      void queryClient.invalidateQueries({ queryKey: ["objects", workspaceId] });
      void queryClient.invalidateQueries({ queryKey: ["viewResults"] });
      queryClient.removeQueries({ queryKey: ["object", objectId] });
      // See ObjectDetailPage.tsx's original comment: awaited so a redirect
      // to WorkspaceHome computes off the post-delete workspace state
      // (dashboardObjectId cleared server-side) instead of a stale cache hit.
      await queryClient.invalidateQueries({ queryKey: ["workspace", workspaceId] });
      navigate(`/w/${workspaceId}`);
    },
  });

  async function deleteObject(title: string) {
    if (!objectId) return;
    const confirmed = await confirm({
      title: `"${title || "Untitled"}" endgültig löschen?`,
      description:
        "Dateien, die nur diesem Objekt gehören, werden mitgelöscht, und Verlinkungen von anderen Objekten hierher werden entfernt. Das kann nicht rückgängig gemacht werden.",
      confirmLabel: "Delete",
      danger: true,
    });
    if (confirmed) deleteMutation.mutate();
  }

  return { deleteObject, isDeleting: deleteMutation.isPending };
}
