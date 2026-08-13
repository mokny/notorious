import { Trans } from "react-i18next";
import { ApiKeysSettings } from "../ApiKeysSettings.js";

export function ApiKeysSettingsTab() {
  return (
    <div>
      <p className="text-sm text-ink-muted">
        <Trans i18nKey="settings.apiKeys.description" components={{ code: <code /> }} />
      </p>
      <ApiKeysSettings />
    </div>
  );
}
