import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { WorkspaceAiSettings } from "../WorkspaceAiSettings.js";

export function WorkspaceAiSettingsTab() {
  const { t } = useTranslation();
  const { workspaceId } = useParams<{ workspaceId: string }>();

  return (
    <div>
      <p className="text-sm text-ink-muted">{t("settings.workspace.ai.description")}</p>
      <WorkspaceAiSettings workspaceId={workspaceId!} />
    </div>
  );
}
