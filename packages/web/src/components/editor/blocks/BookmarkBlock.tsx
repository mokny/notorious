import type { BookmarkContent } from "@notorious/shared";
import { useDebouncedSave } from "../../../hooks/useDebouncedSave.js";
import { Icon } from "../../ui/Icon.js";

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function BookmarkBlock({
  content: externalContent,
  onSave,
}: {
  content: BookmarkContent;
  onSave: (c: BookmarkContent) => Promise<void>;
}) {
  const [content, save] = useDebouncedSave(externalContent, onSave);

  if (!content.url) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-ink-muted">
        <Icon name="bookmark" className="h-4 w-4 shrink-0" />
        <input
          placeholder="Paste a URL to bookmark…"
          autoComplete="off"
          className="flex-1 border-none bg-transparent outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const value = (e.target as HTMLInputElement).value.trim();
              if (value) save({ ...content, url: value });
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-accent/10 text-accent">
        <Icon name="bookmark" className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <input
          value={content.title ?? ""}
          onChange={(e) => save({ ...content, title: e.target.value })}
          placeholder={hostnameOf(content.url)}
          autoComplete="off"
          className="w-full border-none bg-transparent text-sm font-medium outline-none"
        />
        <input
          value={content.description ?? ""}
          onChange={(e) => save({ ...content, description: e.target.value })}
          placeholder="Add a description…"
          autoComplete="off"
          className="w-full border-none bg-transparent text-xs text-ink-muted outline-none"
        />
        <a href={content.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-accent hover:underline">
          {content.url}
        </a>
      </div>
      <button
        onClick={() => save({ url: "" })}
        title="Change URL"
        className="shrink-0 rounded p-1 text-ink-muted hover:bg-surface-raised hover:text-ink"
      >
        <Icon name="close" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
