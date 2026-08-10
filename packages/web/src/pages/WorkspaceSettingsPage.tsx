import { Outlet, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { workspaceApi, systemApi } from "../lib/api/resources.js";
import { useAuth } from "../context/AuthContext.js";
import { Tabs, type TabItem } from "../components/ui/Tabs.js";

export function WorkspaceSettingsPage() {
  const { workspaceId } = useParams<{ workspaceId: string }>();
  const { user } = useAuth();
  const { data: workspace } = useQuery({ queryKey: ["workspace", workspaceId], queryFn: () => workspaceApi.get(workspaceId!) });
  const { data: version } = useQuery({ queryKey: ["version"], queryFn: systemApi.version, staleTime: Infinity });
  const isOwner = workspace?.ownerId === user?.id;

  const base = `/w/${workspaceId}/settings`;
  const tabs: TabItem[] = [
    { key: "general", label: "General", to: `${base}/general` },
    { key: "members", label: "Members", to: `${base}/members` },
    ...(isOwner
      ? [
          { key: "sharing", label: "Sharing", to: `${base}/sharing` },
          { key: "ai", label: "AI", to: `${base}/ai` },
          { key: "webhooks", label: "Webhooks", to: `${base}/webhooks` },
          { key: "backup", label: "Backup", to: `${base}/backup` },
          { key: "danger-zone", label: "Danger zone", to: `${base}/danger-zone` },
        ]
      : []),
  ];

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
      <h1 className="text-xl font-semibold">Workspace settings</h1>
      <Tabs items={tabs} />

      <Outlet />

      {version && <p className="pt-6 text-center text-xs text-ink-muted">Notorious v{version.version}</p>}
    </div>
  );
}
