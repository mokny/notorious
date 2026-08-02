import { useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
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
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (content.url) {
    return (
      <figure>
        <div className="group relative">
          <Dialog.Root open={lightboxOpen} onOpenChange={setLightboxOpen}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                title="Click to enlarge"
                // A view action, not an edit - stays clickable even while the
                // object is locked (see readOnlyContent.ts's blanket
                // `button:not([data-view-toggle])` rule).
                data-view-toggle
                className="block w-full cursor-zoom-in"
              >
                <img src={withShareToken(content.url)} alt={content.caption ?? ""} className="max-h-96 w-full rounded-lg object-cover" />
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-black/80" />
              {/* Clicking anywhere (including the image itself) closes it again, matching the trigger's "click to enlarge" - a second, explicit close button covers anyone who'd rather not guess. */}
              <Dialog.Content
                onClick={() => setLightboxOpen(false)}
                className="fixed inset-0 z-50 flex items-center justify-center p-8 outline-none"
              >
                <Dialog.Title className="sr-only">{content.caption || "Image"}</Dialog.Title>
                <img
                  src={withShareToken(content.url)}
                  alt={content.caption ?? ""}
                  className="max-h-full max-w-full cursor-zoom-out rounded-lg object-contain"
                />
                <Dialog.Close
                  title="Close"
                  data-view-toggle
                  className="fixed right-4 top-4 rounded-md bg-black/40 p-2 text-white hover:bg-black/60"
                >
                  <Icon name="close" className="h-5 w-5" />
                </Dialog.Close>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          {/* An <a download>, not a button - readOnlyContent.ts's lock only
              disables input/textarea/select/button/contenteditable/canvas, so
              this stays clickable while the object is locked without needing
              a data-view-toggle escape hatch. Hover-revealed like
              CoverImage.tsx's own Change/Remove controls. */}
          <a
            href={withShareToken(content.url)}
            download
            title="Download image"
            className="absolute right-2 top-2 rounded-md bg-black/40 p-1.5 text-white opacity-0 transition-opacity hover:bg-black/60 group-hover:opacity-100"
          >
            <Icon name="download" className="h-4 w-4" />
          </a>
        </div>
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
    // Dropping a PDF/audio file into the editor also lands here (see
    // blockForDroppedFile in BlockEditor.tsx) - that content is our own,
    // same-origin, server-controlled upload, not an arbitrary third-party
    // page, so it doesn't need (and shouldn't get) the sandbox restriction
    // below: Chrome's built-in PDF viewer can flat-out refuse to render
    // inside a sandboxed iframe, replacing it with "This page has been
    // blocked by Chrome" instead of the document. Pasted external embed
    // URLs (the other use of this block) stay sandboxed.
    const isOwnUpload = content.url.startsWith("/api/v1/files/");
    return (
      <iframe
        src={withShareToken(content.url)}
        className="h-96 w-full rounded-lg border border-border"
        {...(isOwnUpload ? {} : { sandbox: "allow-scripts allow-same-origin allow-popups" })}
      />
    );
  }
  return <UrlPrompt label="page to embed" onSave={(url) => onSave({ ...content, url })} />;
}
