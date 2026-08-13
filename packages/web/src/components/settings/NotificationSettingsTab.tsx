import { useTranslation } from "react-i18next";
import { NotificationSettings } from "../NotificationSettings.js";

export function NotificationSettingsTab() {
  const { t } = useTranslation();
  return (
    <div>
      <p className="text-sm text-ink-muted">{t("settings.notifications.description")}</p>
      <NotificationSettings />
    </div>
  );
}
