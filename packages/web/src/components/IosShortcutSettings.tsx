import { isIOS } from "../lib/platform.js";

/**
 * iOS/Safari doesn't support the Web Share Target API (`share_target` in the manifest), so
 * Notorious can't register as a share-sheet target there the way it does once installed on
 * Android. The workaround is a downloadable Shortcuts.app shortcut that POSTs the shared item to
 * `/api/v1/share-target/intake-multipart` (Bearer-token auth, since a Shortcut has no session
 * cookie - see ApiKeysSettings.tsx for generating one) and then opens Safari on the result to
 * finish filing it, same as the Android share-sheet flow. Only shown on iOS: the shortcut is
 * useless anywhere else.
 *
 * `public/notorious.shortcut` must stay signed (`shortcuts sign -m anyone -i ... -o ...`) - iOS
 * flatly refuses to import an unsigned .shortcut file (no "allow untrusted" override exists for
 * this path, unlike Shortcuts automations). The `shortcuts` CLI only exists on macOS, so any edit
 * to the shortcut's actions needs a manual re-sign on a Mac before it's committed; there's no way
 * to do this from the Linux prod build.
 *
 * The shortcut's actions were originally hand-authored as a plist (no way to script Apple's own
 * Shortcuts editor from here), which took several rounds to get right - the first action's file
 * body needs *both* a `WFInput` and a `WFRequestVariable` parameter set to the same
 * ExtensionInput attachment, or Shortcuts silently sends an empty body with no error. The current
 * file was derived from a real working export (device-repaired, then re-extracted structurally)
 * rather than guessed, so this should import working end-to-end without manual fixups.
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
        <li>Open the downloaded file to import it into the Shortcuts app.</li>
        <li>
          Create an API key above under "API keys", then edit the shortcut's first action ("Get Contents of URL")
          and replace, inside its URL field, both{" "}
          <code className="mx-1 rounded bg-surface px-1">your-notorious-domain.example</code> with{" "}
          <code className="mx-1 rounded bg-surface px-1">{window.location.origin.replace(/^https?:\/\//, "")}</code>{" "}
          and <code className="mx-1 rounded bg-surface px-1">PASTE_YOUR_API_KEY_HERE</code> with that key.
        </li>
        <li>Also update the domain in the last action's URL field ("Open URLs") the same way.</li>
        <li>Now "Notorious" appears in the share sheet for photos, files, and links from any app.</li>
      </ol>
    </div>
  );
}
