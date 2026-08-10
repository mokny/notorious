import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { workspaceApi } from "../../lib/api/resources.js";
import { useConfirm } from "../../context/ConfirmContext.js";
import { Button } from "../ui/Button.js";

export function WorkspaceDangerZoneSettings() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const queryClient = useQueryClient();
  const { data: workspace } = useQuery({ queryKey: ["workspace", workspaceId], queryFn: () => workspaceApi.get(workspaceId!) });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: () => workspaceApi.remove(workspaceId!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["workspaces"] });
      navigate("/", { replace: true });
    },
  });

  async function handleDeleteWorkspace() {
    if (!workspace) return;
    const confirmed = await confirm({
      title: `Delete "${workspace.name}"?`,
      description:
        "This deletes the entire workspace for everyone: every object, block, file, view and member's access. This cannot be undone.",
      confirmLabel: "Delete workspace",
      danger: true,
    });
    if (confirmed) deleteWorkspaceMutation.mutate();
  }

  return (
    <div>
      <p className="text-sm text-ink-muted">
        Permanently deletes this workspace for everyone - every object, block, file, view and member's access. Not
        reversible; download a backup first if you might want any of this later.
      </p>
      <div className="mt-4">
        <Button variant="danger" onClick={handleDeleteWorkspace} disabled={deleteWorkspaceMutation.isPending}>
          Delete this workspace
        </Button>
      </div>
    </div>
  );
}
