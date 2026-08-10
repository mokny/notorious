import { BookmarkletSettings } from "../BookmarkletSettings.js";
import { IosShortcutSettings } from "../IosShortcutSettings.js";

/** "Share to Notorious" setup - bookmarklet + iOS Shortcut, both feeding ShareTargetPage.tsx. */
export function IntegrationsSettings() {
  return (
    <div className="space-y-6">
      <p className="text-sm text-ink-muted">
        Share images, videos, documents, and links into Notorious directly from your phone's share sheet (once
        installed as an app on Android) or from a desktop browser bookmarklet.
      </p>
      <BookmarkletSettings />
      <IosShortcutSettings />
    </div>
  );
}
