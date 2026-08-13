import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { WebhooksSettings } from "../WebhooksSettings.js";

export function WorkspaceWebhooksSettingsTab() {
  const { t } = useTranslation();
  const { workspaceId } = useParams<{ workspaceId: string }>();

  return (
    <div>
      <p className="text-sm text-ink-muted">{t("settings.workspace.webhooks.description")}</p>
      <WebhooksSettings workspaceId={workspaceId!} />
    </div>
  );
}
