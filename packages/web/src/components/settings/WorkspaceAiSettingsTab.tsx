import { useParams } from "react-router-dom";
import { WorkspaceAiSettings } from "../WorkspaceAiSettings.js";

export function WorkspaceAiSettingsTab() {
  const { workspaceId } = useParams<{ workspaceId: string }>();

  return (
    <div>
      <p className="text-sm text-ink-muted">
        Configure one AI provider API key shared by everyone in this workspace, used by the Agent Chat and AI
        blocks. Optionally cap total token usage and pick how often it resets.
      </p>
      <WorkspaceAiSettings workspaceId={workspaceId!} />
    </div>
  );
}
