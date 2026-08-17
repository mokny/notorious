import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ModulesSettings } from "../ModulesSettings.js";

export function WorkspaceModulesSettingsTab() {
  const { t } = useTranslation();
  const { workspaceId } = useParams<{ workspaceId: string }>();

  return (
    <div>
      <p className="text-sm text-ink-muted">{t("settings.workspace.modules.description")}</p>
      <ModulesSettings workspaceId={workspaceId!} />
    </div>
  );
}
