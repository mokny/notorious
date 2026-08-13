import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ShareDialog } from "../ShareDialog.js";
import { ActiveShareLinksList } from "../ActiveShareLinksList.js";

export function WorkspaceSharingSettings() {
  const { t } = useTranslation();
  const { workspaceId } = useParams<{ workspaceId: string }>();

  return (
    <div>
      <p className="text-sm text-ink-muted">{t("settings.workspace.sharing.description")}</p>
      <div className="mt-4">
        <ShareDialog workspaceId={workspaceId!} objectId={null} label={t("settings.workspace.sharing.shareWorkspace")} />
      </div>

      <p className="mt-6 text-xs font-medium uppercase tracking-wide text-ink-muted">
        {t("settings.workspace.sharing.activeLinks")}
      </p>
      <ActiveShareLinksList workspaceId={workspaceId!} />
    </div>
  );
}
