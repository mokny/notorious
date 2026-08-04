import { useMemo } from "react";
import { Button } from "./ui/Button.js";

/**
 * A bookmarklet runs in the context of whatever page is open (not Notorious's
 * own origin), so it can't use the session cookie directly. Instead it opens
 * a real navigation to Notorious's own /share-target page, passing along
 * href/title/selection - once loaded there, the normal session cookie
 * applies and ShareTargetPage.tsx takes it from there.
 */
function buildBookmarklet(origin: string): string {
  const body = `var u=encodeURIComponent(location.href),t=encodeURIComponent(document.title),s=encodeURIComponent(window.getSelection().toString());window.open('${origin}/share-target?url='+u+'&title='+t+'&text='+s,'_blank');`;
  return `javascript:(function(){${body}})();`;
}

export function BookmarkletSettings() {
  const bookmarklet = useMemo(() => buildBookmarklet(window.location.origin), []);

  return (
    <div className="mt-3 space-y-3">
      <p className="text-sm text-ink-muted">
        Drag this link to your browser's bookmarks bar. Click it on any page to share the link (and any text you've
        selected) into Notorious.
      </p>
      <div className="flex items-center gap-3 rounded-lg border border-accent/40 bg-accent/5 p-3">
        <a
          href={bookmarklet}
          onClick={(e) => e.preventDefault()}
          className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-white"
        >
          Share to Notorious
        </a>
        <Button variant="secondary" onClick={() => navigator.clipboard.writeText(bookmarklet)}>
          Copy code
        </Button>
      </div>
      <code className="block overflow-x-auto rounded-md bg-surface px-2 py-1 text-xs text-ink-muted">{bookmarklet}</code>
    </div>
  );
}
