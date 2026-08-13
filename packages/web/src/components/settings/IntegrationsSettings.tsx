import { useTranslation } from "react-i18next";
import { BookmarkletSettings } from "../BookmarkletSettings.js";
import { IosShortcutSettings } from "../IosShortcutSettings.js";

/** "Share to Notorious" setup - bookmarklet + iOS Shortcut, both feeding ShareTargetPage.tsx. */
export function IntegrationsSettings() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-muted">{t("settings.integrations.description")}</p>
      <BookmarkletSettings />
      <IosShortcutSettings />
    </div>
  );
}
