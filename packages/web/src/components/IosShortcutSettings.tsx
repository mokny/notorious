import { isIOS } from "../lib/platform.js";

/**
 * iOS/Safari doesn't support the Web Share Target API (`share_target` in the manifest), so
 * Notorious can't register as a share-sheet target there the way it does once installed on
 * Android. The workaround is a downloadable Shortcuts.app shortcut that POSTs the shared item to
 * `/api/v1/share-target/intake-multipart` (Bearer-token auth, since a Shortcut has no session
 * cookie - see ApiKeysSettings.tsx for generating one) and then opens Safari on the result to
 * finish filing it, same as the Android share-sheet flow. Only shown on iOS: the shortcut is
 * useless anywhere else, and unsigned .shortcut files require enabling "Allow Untrusted
 * Shortcuts" first, which is confusing to surface to non-iOS users.
 */
export function IosShortcutSettings() {
  if (!isIOS()) return null;

  return (
    <div className="mt-3 space-y-3 rounded-lg border border-accent/40 bg-accent/5 p-3">
      <p className="text-sm text-ink-muted">
        iOS doesn't support share-sheet targets for web apps directly, but you can install a Shortcut that does the
        same job.
      </p>
      <a
        href="/notorious.shortcut"
        download
        className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white"
      >
        Download iOS Shortcut
      </a>
      <ol className="list-decimal space-y-1 pl-5 text-xs text-ink-muted">
        <li>
          Open the downloaded file to import it into the Shortcuts app. If iOS refuses to run it, enable "Allow
          Untrusted Shortcuts" in Settings → Shortcuts first.
        </li>
        <li>
          Create an API key above under "API keys", then edit the shortcut's first action: replace
          <code className="mx-1 rounded bg-surface px-1">your-notorious-domain.example</code> with{" "}
          <code className="mx-1 rounded bg-surface px-1">{window.location.origin.replace(/^https?:\/\//, "")}</code>
          and <code className="mx-1 rounded bg-surface px-1">PASTE_YOUR_API_KEY_HERE</code> with that key (in both
          the URL field and the Authorization header).
        </li>
        <li>Also update the domain in the last action's URL field the same way.</li>
        <li>Now "Notorious" appears in the share sheet for photos, files, and links from any app.</li>
      </ol>
    </div>
  );
}
