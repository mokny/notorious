import { useParams } from "react-router-dom";
import { ShareDialog } from "../ShareDialog.js";
import { ActiveShareLinksList } from "../ActiveShareLinksList.js";

export function WorkspaceSharingSettings() {
  const { workspaceId } = useParams<{ workspaceId: string }>();

  return (
    <div>
      <p className="text-sm text-ink-muted">
        Share the whole workspace via a link, without requiring an account. Set a role, and optionally an expiry -
        you can revoke it at any time below.
      </p>
      <div className="mt-4">
        <ShareDialog workspaceId={workspaceId!} objectId={null} label="Share workspace" />
      </div>

      <p className="mt-6 text-xs font-medium uppercase tracking-wide text-ink-muted">
        Active share links (workspace and individual objects)
      </p>
      <ActiveShareLinksList workspaceId={workspaceId!} />
    </div>
  );
}
