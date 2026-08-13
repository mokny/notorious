import { useState } from "react";
import { useTranslation } from "react-i18next";
import type { BookmarkContent } from "@notorious/shared";
import { useDebouncedSave } from "../../../hooks/useDebouncedSave.js";
import { linkPreviewApi, fileApi } from "../../../lib/api/resources.js";
import { externalLinkAttrs } from "../../../lib/externalLink.js";
import { IconPicker } from "../../IconPicker.js";
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
  workspaceId,
  objectId,
  onSave,
}: {
  content: BookmarkContent;
  workspaceId: string;
  objectId: string;
  onSave: (c: BookmarkContent) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [content, save] = useDebouncedSave(externalContent, onSave);
  const [isFetchingTitle, setIsFetchingTitle] = useState(false);

  async function setUrl(value: string) {
    await save({ ...content, url: value });
    // Best-effort: the page might not respond, block the request, or simply
    // have no <title>/favicon - both fields stay freely editable either way,
    // this just saves doing it out by hand for the common case.
    setIsFetchingTitle(true);
    try {
      const { title, icon } = await linkPreviewApi.fetch(value);
      if (title || icon) save({ ...content, url: value, ...(title ? { title } : {}), ...(icon ? { icon } : {}) });
    } catch {
      // Ignored - nothing fetched is not an error the user needs to see.
    } finally {
      setIsFetchingTitle(false);
    }
  }

  if (!content.url) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-ink-muted">
        <Icon name="bookmark" className="h-4 w-4 shrink-0" />
        <input
          placeholder={t("editor.blocks.bookmark.urlPlaceholder")}
          autoComplete="off"
          className="flex-1 border-none bg-transparent outline-none"
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              const value = (e.target as HTMLInputElement).value.trim();
              if (value) void setUrl(value);
            }
          }}
          onBlur={(e) => {
            const value = e.target.value.trim();
            if (value) void setUrl(value);
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-3">
      <IconPicker
        icon={content.icon ?? null}
        fallbackIcon="bookmark"
        onChangeIcon={async (newIcon) => save({ ...content, icon: newIcon })}
        onUploadIcon={async (file) => {
          const asset = await fileApi.upload(workspaceId, file, objectId);
          return fileApi.downloadUrl(asset.id);
        }}
        resettable
      />
      <div className="min-w-0 flex-1 space-y-1">
        <input
          value={content.title ?? ""}
          onChange={(e) => save({ ...content, title: e.target.value })}
          placeholder={isFetchingTitle ? t("editor.blocks.bookmark.fetchingTitle") : hostnameOf(content.url)}
          autoComplete="off"
          className="w-full border-none bg-transparent text-sm font-medium outline-none"
        />
        <input
          value={content.description ?? ""}
          onChange={(e) => save({ ...content, description: e.target.value })}
          placeholder={t("editor.blocks.bookmark.descriptionPlaceholder")}
          autoComplete="off"
          className="w-full border-none bg-transparent text-xs text-ink-muted outline-none"
        />
        <a {...externalLinkAttrs(content.url)} className="block truncate text-xs text-accent hover:underline">
          {content.url}
        </a>
      </div>
      <button
        onClick={() => save({ url: "" })}
        title={t("editor.blocks.bookmark.changeUrl")}
        className="shrink-0 rounded p-1 text-ink-muted hover:bg-surface-raised hover:text-ink"
      >
        <Icon name="close" className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
