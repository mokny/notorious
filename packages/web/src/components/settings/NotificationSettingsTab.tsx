import { NotificationSettings } from "../NotificationSettings.js";

export function NotificationSettingsTab() {
  return (
    <div>
      <p className="text-sm text-ink-muted">Get a push notification for task reminders, invitations and assignments.</p>
      <NotificationSettings />
    </div>
  );
}
