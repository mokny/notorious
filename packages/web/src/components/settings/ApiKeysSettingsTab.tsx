import { ApiKeysSettings } from "../ApiKeysSettings.js";

export function ApiKeysSettingsTab() {
  return (
    <div>
      <p className="text-sm text-ink-muted">
        Personal keys for scripts and other systems to call the API as you, across all of your workspaces. Send them
        as <code>Authorization: Bearer &lt;key&gt;</code>.
      </p>
      <ApiKeysSettings />
    </div>
  );
}
