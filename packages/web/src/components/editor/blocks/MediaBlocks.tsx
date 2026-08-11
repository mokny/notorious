import { useRef, useState } from "react";
import type { ImageContent, VideoContent, EmbedContent, PdfContent, AudioContent, FileContent } from "@notorious/shared";
import { fileApi } from "../../../lib/api/resources.js";
import { withShareToken } from "../../../lib/api/shareMode.js";
import { useDebouncedSave } from "../../../hooks/useDebouncedSave.js";
import { useExportMode } from "../../../lib/export/exportMode.js";
import { Icon } from "../../ui/Icon.js";
import { Lightbox } from "../../ui/Lightbox.js";
import { useBlockEditor } from "../BlockEditorContext.js";
import { HighlightedText } from "../HighlightedText.js";

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
  const { searchHighlight } = useBlockEditor();
  const searchTerms = searchHighlight?.terms ?? [];
  // Same "highlighted preview until clicked" idea as ChecklistBlock.tsx's
  // `searchPreviewOverridden` - the caption is a plain `<input>`, not a
  // TipTap instance, so it can't use SearchHighlight.ts's decorations.
  const [captionPreviewOverridden, setCaptionPreviewOverridden] = useState(false);
  const showCaptionPreview = searchTerms.length > 0 && !captionPreviewOverridden;

  if (content.url) {
    return (
      <figure>
        <div className="group relative">
          <button
            type="button"
            title="Click to enlarge"
            // A view action, not an edit - stays clickable even while the
            // object is locked (see readOnlyContent.ts's blanket
            // `button:not([data-view-toggle])` rule).
            data-view-toggle
            onClick={() => setLightboxOpen(true)}
            className="block w-full cursor-zoom-in"
          >
            <img src={withShareToken(content.url)} alt={content.caption ?? ""} className="max-h-96 w-full rounded-lg object-cover" />
          </button>
          {lightboxOpen && (
            <Lightbox
              images={[{ src: withShareToken(content.url), alt: content.caption ?? "" }]}
              index={0}
              onIndexChange={() => {}}
              onClose={() => setLightboxOpen(false)}
            />
          )}
          {/* A view action, not an edit - stays reachable while the object
              is locked. readOnlyContent.ts's lock only disables input/
              textarea/select/button/contenteditable/canvas, so an `<a>`
              would already stay clickable either way - but this also uses
              the app's hover-reveal `opacity-0 ... group-hover:opacity-100`
              convention, which globals.css's `.locked-content` rule hides
              *unconditionally* for anything matching it (drag handles,
              delete buttons, ...) regardless of tag. `data-view-toggle`
              exempts it from that rule too (see globals.css's own comment),
              same escape hatch the lightbox trigger button above uses. */}
          <a
            href={withShareToken(content.url)}
            download
            title="Download image"
            data-view-toggle
            className="absolute right-2 top-2 rounded-md bg-black/40 p-1.5 text-white opacity-0 transition-opacity hover:bg-black/60 group-hover:opacity-100"
          >
            <Icon name="download" className="h-4 w-4" />
          </a>
        </div>
        {showCaptionPreview ? (
          <div onClick={() => setCaptionPreviewOverridden(true)} className="mt-1 w-full cursor-text text-center text-xs text-ink-muted">
            <HighlightedText text={content.caption || "Caption"} terms={searchTerms} />
          </div>
        ) : (
          <input
            value={content.caption ?? ""}
            onChange={(e) => save({ ...content, caption: e.target.value })}
            onBlur={() => setCaptionPreviewOverridden(false)}
            autoFocus={captionPreviewOverridden}
            placeholder="Caption"
            className="mt-1 w-full border-none bg-transparent text-center text-xs text-ink-muted outline-none"
          />
        )}
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
  const exportMode = useExportMode();

  if (content.url) {
    const src = withShareToken(content.url);
    // Video can't play in a static PDF/JPEG/HTML export - shows the poster
    // frame (whatever the browser decodes at `preload="metadata"`, since no
    // server-generated thumbnail exists - see VideoContent) with a play-icon
    // overlay and a link back to the real, playable file instead.
    if (exportMode) {
      return (
        <a href={src} target="_blank" rel="noreferrer" className="group relative block overflow-hidden rounded-lg bg-black">
          <video src={src} preload="metadata" muted className="max-h-96 w-full" />
          <span className="absolute inset-0 flex items-center justify-center bg-black/30">
            <Icon name="play" className="h-10 w-10 text-white" />
          </span>
        </a>
      );
    }
    return <video src={src} controls className="max-h-96 w-full rounded-lg bg-black" />;
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

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[unitIndex]}`;
}

/** Generic "upload a file, no URL-paste option" prompt - unlike UrlPrompt, pdf/audio/file blocks have no meaningful remote-URL use case (the whole point is a locally uploaded file), so this only ever shows the upload button. */
function UploadPrompt({ label, accept, onUpload }: { label: string; accept: string; onUpload: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-3 text-sm text-ink-muted">
      <Icon name="upload" className="h-4 w-4 shrink-0" />
      <button onClick={() => inputRef.current?.click()} className="text-accent hover:underline">
        Upload {label}…
      </button>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onUpload(file);
        }}
      />
    </div>
  );
}

/** A dropped/uploaded PDF (see PdfContent) - shown as a collapsible card rather than loading the PDF up front like EmbedBlock's iframe does for a pasted embed URL: the iframe only mounts once expanded, so a document-heavy object doesn't pay to load every PDF in it just to render the page. */
export function PdfBlock({ content, workspaceId, objectId, onSave }: MediaProps<PdfContent>) {
  const [open, setOpen] = useState(false);

  if (!content.url) {
    return (
      <UploadPrompt
        label="a PDF"
        accept="application/pdf"
        onUpload={async (file) => {
          const asset = await fileApi.upload(workspaceId, file, objectId);
          await onSave({ url: fileApi.downloadUrl(asset.id), filename: file.name, size: file.size, fileId: asset.id });
        }}
      />
    );
  }

  return (
    <div className="rounded-lg border border-border">
      <div className="flex items-center gap-2 p-2">
        <button
          type="button"
          data-view-toggle
          onClick={() => setOpen((v) => !v)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-1 text-left hover:bg-surface-raised"
        >
          <Icon name={open ? "chevron-down" : "chevron-right"} className="h-4 w-4 shrink-0 text-ink-muted" />
          <Icon name="file-text" className="h-4 w-4 shrink-0 text-ink-muted" />
          <span className="min-w-0 flex-1 truncate text-sm">{content.filename}</span>
          <span className="shrink-0 text-xs text-ink-muted">{formatFileSize(content.size)}</span>
        </button>
        <a
          href={withShareToken(content.url)}
          download={content.filename}
          title="Download"
          data-view-toggle
          className="shrink-0 rounded-md p-1.5 text-ink-muted hover:bg-surface-raised hover:text-ink"
        >
          <Icon name="download" className="h-4 w-4" />
        </a>
      </div>
      {open && (
        // Only mounted once expanded - the whole point of the collapsed
        // state above (see this block's own doc comment).
        <iframe src={withShareToken(content.url)} className="h-96 w-full border-t border-border" />
      )}
    </div>
  );
}

/** A dropped/uploaded audio file (see AudioContent) - a native HTML5 player, unlike EmbedBlock's iframe which audio used to fall back to. */
export function AudioBlock({ content, workspaceId, objectId, onSave }: MediaProps<AudioContent>) {
  if (!content.url) {
    return (
      <UploadPrompt
        label="audio"
        accept="audio/*"
        onUpload={async (file) => {
          const asset = await fileApi.upload(workspaceId, file, objectId);
          await onSave({ url: fileApi.downloadUrl(asset.id), filename: file.name, size: file.size, fileId: asset.id });
        }}
      />
    );
  }

  return (
    <div className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 text-sm">
        <Icon name="mic" className="h-4 w-4 shrink-0 text-ink-muted" />
        <span className="min-w-0 flex-1 truncate">{content.filename}</span>
        <span className="shrink-0 text-xs text-ink-muted">{formatFileSize(content.size)}</span>
      </div>
      <audio src={withShareToken(content.url)} controls className="w-full" />
    </div>
  );
}

/** Catch-all for a dropped/uploaded file that isn't an image/video/pdf/audio (see FileContent) - just an icon+name+size download card, no inline preview. */
export function FileBlock({ content, workspaceId, objectId, onSave }: MediaProps<FileContent>) {
  if (!content.url) {
    return (
      <UploadPrompt
        label="a file"
        accept="*/*"
        onUpload={async (file) => {
          const asset = await fileApi.upload(workspaceId, file, objectId);
          await onSave({ url: fileApi.downloadUrl(asset.id), filename: file.name, size: file.size, mimeType: file.type, fileId: asset.id });
        }}
      />
    );
  }

  return (
    <a
      href={withShareToken(content.url)}
      download={content.filename}
      data-view-toggle
      className="flex items-center gap-2 rounded-lg border border-border p-2 hover:bg-surface-raised"
    >
      <Icon name="file-text" className="h-5 w-5 shrink-0 text-ink-muted" />
      <span className="min-w-0 flex-1 truncate text-sm">{content.filename}</span>
      <span className="shrink-0 text-xs text-ink-muted">{formatFileSize(content.size)}</span>
      <Icon name="download" className="h-4 w-4 shrink-0 text-ink-muted" />
    </a>
  );
}
