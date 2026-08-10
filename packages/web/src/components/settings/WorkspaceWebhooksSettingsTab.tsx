import { useParams } from "react-router-dom";
import { WebhooksSettings } from "../WebhooksSettings.js";

export function WorkspaceWebhooksSettingsTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>();

  return (
    <div>
      <p className="text-sm text-ink-muted">
        Get an HTTP POST with the full object whenever something changes in this workspace - useful for syncing to
        another system or triggering your own automation.
      </p>
      <WebhooksSettings workspaceId={workspaceId!} />
    </div>
  );
}
