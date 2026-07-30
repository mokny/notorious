import { useRef } from "react";
import type { ImageContent, VideoContent, EmbedContent } from "@notorious/shared";
import { fileApi } from "../../../lib/api/resources.js";
import { withShareToken } from "../../../lib/api/shareMode.js";
import { useDebouncedSave } from "../../../hooks/useDebouncedSave.js";
import { Icon } from "../../ui/Icon.js";

interface MediaProps<T> {
  content: T;
  workspaceId: string;
  objectId: string;
  onSave: (content: T) => Promise<void>;
}

function UrlPrompt({ onSave, label }: { onSave: (url: string) => void; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-ink-muted">
      <Icon name="image" className="h-4 w-4" />
      <input
        placeholder={`Paste a ${label} URL, or upload below`}
        className="flex-1 border-none bg-transparent outline-none"
        onKeyDown={(e) => {
          if (e.key === "Enter") onSave((e.target as HTMLInputElement).value);
        }}
      />
    </div>
  );
}

export function ImageBlock({ content: externalContent, workspaceId, objectId, onSave }: MediaProps<ImageContent>) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [content, save] = useDebouncedSave(externalContent, onSave);

  if (content.url) {
    return (
      <figure>
        <img src={withShareToken(content.url)} alt={content.caption ?? ""} className="max-h-96 w-full rounded-lg object-cover" />
        <input
          value={content.caption ?? ""}
          onChange={(e) => save({ ...content, caption: e.target.value })}
          placeholder="Caption"
          className="mt-1 w-full border-none bg-transparent text-center text-xs text-ink-muted outline-none"
        />
      </figure>
    );
  }

  return (
    <div className="space-y-2">
      <UrlPrompt label="image" onSave={(url) => save({ ...content, url })} />
      <button onClick={() => inputRef.current?.click()} className="text-xs text-accent hover:underline">
        Or upload a file…
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const asset = await fileApi.upload(workspaceId, file, objectId);
          save({ ...content, url: fileApi.downloadUrl(asset.id), fileId: asset.id });
        }}
      />
    </div>
  );
}

export function VideoBlock({ content, workspaceId, objectId, onSave }: MediaProps<VideoContent>) {
  const inputRef = useRef<HTMLInputElement>(null);

  if (content.url) {
    return <video src={withShareToken(content.url)} controls className="max-h-96 w-full rounded-lg bg-black" />;
  }

  return (
    <div className="space-y-2">
      <UrlPrompt label="video" onSave={(url) => onSave({ ...content, url })} />
      <button onClick={() => inputRef.current?.click()} className="text-xs text-accent hover:underline">
        Or upload a file…
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="video/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          const asset = await fileApi.upload(workspaceId, file, objectId);
          onSave({ ...content, url: fileApi.downloadUrl(asset.id), fileId: asset.id });
        }}
      />
    </div>
  );
}

export function EmbedBlock({ content, onSave }: { content: EmbedContent; onSave: (c: EmbedContent) => void }) {
  if (content.url) {
    return (
      <iframe
        src={content.url}
        className="h-96 w-full rounded-lg border border-border"
        sandbox="allow-scripts allow-same-origin allow-popups"
      />
    );
  }
  return <UrlPrompt label="page to embed" onSave={(url) => onSave({ ...content, url })} />;
}
