import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { workspaceApi } from "../../lib/api/resources.js";
import { useConfirm } from "../../context/ConfirmContext.js";
import { Button } from "../ui/Button.js";

export function WorkspaceDangerZoneSettings() {
  const { t } = useTranslation();
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
      title: t("settings.workspace.dangerZone.deleteConfirmTitle", { name: workspace.name }),
      description: t("settings.workspace.dangerZone.deleteConfirmDescription"),
      confirmLabel: t("settings.workspace.dangerZone.deleteConfirmButton"),
      danger: true,
    });
    if (confirmed) deleteWorkspaceMutation.mutate();
  }

  return (
    <div>
      <p className="text-sm text-ink-muted">{t("settings.workspace.dangerZone.description")}</p>
      <div className="mt-4">
        <Button variant="danger" onClick={handleDeleteWorkspace} disabled={deleteWorkspaceMutation.isPending}>
          {t("settings.workspace.dangerZone.deleteButton")}
        </Button>
      </div>
    </div>
  );
}
