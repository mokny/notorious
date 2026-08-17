import { Outlet, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { workspaceApi, systemApi } from "../lib/api/resources.js";
import { useAuth } from "../context/AuthContext.js";
import { Tabs, type TabItem } from "../components/ui/Tabs.js";

export function WorkspaceSettingsPage() {
  const { t } = useTranslation();
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user } = useAuth();
  const { data: workspace } = useQuery({ queryKey: ["workspace", workspaceId], queryFn: () => workspaceApi.get(workspaceId!) });
  const { data: version } = useQuery({ queryKey: ["version"], queryFn: systemApi.version, staleTime: Infinity });
  const isOwner = workspace?.ownerId === user?.id;

  const base = `/w/${workspaceId}/settings`;
  const tabs: TabItem[] = [
    { key: "general", label: t("settings.workspace.tabs.general"), to: `${base}/general` },
    { key: "members", label: t("settings.workspace.tabs.members"), to: `${base}/members` },
    ...(isOwner
      ? [
          { key: "sharing", label: t("settings.workspace.tabs.sharing"), to: `${base}/sharing` },
          { key: "ai", label: t("settings.workspace.tabs.ai"), to: `${base}/ai` },
          { key: "webhooks", label: t("settings.workspace.tabs.webhooks"), to: `${base}/webhooks` },
          { key: "modules", label: t("settings.workspace.tabs.modules"), to: `${base}/modules` },
          { key: "backup", label: t("settings.workspace.tabs.backup"), to: `${base}/backup` },
          { key: "danger-zone", label: t("settings.workspace.tabs.dangerZone"), to: `${base}/danger-zone` },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <h1 className="text-xl font-semibold">{t("settings.workspace.title")}</h1>
      <Tabs items={tabs} />

      <Outlet />

      {version && (
        <p className="pt-6 text-center text-xs text-ink-muted">
          {t("settings.workspace.footerVersion", { version: version.version })}
        </p>
      )}
    </div>
  );
}
