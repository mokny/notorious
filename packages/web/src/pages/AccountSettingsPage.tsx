import { Outlet, useNavigate } from "react-router-dom";
import { Tabs, type TabItem } from "../components/ui/Tabs.js";
import { Icon } from "../components/ui/Icon.js";
import { getLastWorkspaceId } from "../lib/lastWorkspace.js";

const TABS: TabItem[] = [
  { key: "profile", label: "Profile", to: "/settings/profile" },
  { key: "security", label: "Security", to: "/settings/security" },
  { key: "notifications", label: "Notifications", to: "/settings/notifications" },
  { key: "api-keys", label: "API keys", to: "/settings/api-keys" },
  { key: "integrations", label: "Integrations", to: "/settings/integrations" },
];

/**
 * Account settings are workspace-independent, so this renders full-screen -
 * no workspace sidebar/nav (that only makes sense inside a specific
 * workspace's own context). "Back" returns to whichever workspace was last
 * active, falling back to the workspace picker.
 */
export function AccountSettingsPage() {
  const navigate = useNavigate();

  function handleBack() {
    const lastWorkspaceId = getLastWorkspaceId();
    navigate(lastWorkspaceId ? `/w/${lastWorkspaceId}` : "/");
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-10">
      <button onClick={handleBack} className="mb-6 flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <Icon name="chevron-left" className="h-4 w-4" /> Back
      </button>

      <h1 className="text-xl font-semibold">Account settings</h1>
      <div className="mt-4">
        <Tabs items={TABS} />
      </div>

      <div className="mt-6">
        <Outlet />
      </div>
    </div>
  );
}
