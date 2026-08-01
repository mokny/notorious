import { useRef, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CoverTextStyle } from "@notorious/shared";
import { objectApi, fileApi } from "../lib/api/resources.js";
import { withShareToken } from "../lib/api/shareMode.js";
import { useDebouncedSave } from "../hooks/useDebouncedSave.js";
import { useFitText } from "../hooks/useFitText.js";
import { DEFAULT_COVER_TEXT_STYLE, coverTextCss } from "../lib/coverTextStyle.js";
import { CoverTextStyleEditor } from "./CoverTextStyleEditor.js";
import { Icon } from "./ui/Icon.js";

interface CoverImageProps {
  workspaceId: string;
  objectId: string;
  cover: string | null;
  canEdit: boolean;
  title: string;
  onTitleChange: (value: string) => void;
  coverTextStyle: CoverTextStyle | null;
  /** The object's icon (IconPicker if editable, a plain Icon otherwise - see ObjectDetailPage.tsx), rendered beside the title overlay. */
  icon: ReactNode;
}

/** Extracts the file id from a `fileApi.downloadUrl()`-shaped icon/cover value, so a replaced upload can clean up the one it's replacing. */
function fileIdFromUrl(url: string): string | null {
  return url.startsWith("/api/v1/files/") ? url.slice("/api/v1/files/".length) : null;
}

/**
 * Full-width banner shown above an object's content, capped at 300px tall
 * (cropped, not stretched) - see ObjectDetailPage. When a cover is set, the
 * object's title renders as an overlay on top of it instead of in its usual
 * spot below (ObjectDetailPage hides that copy whenever `cover` is set), fit
 * to span the available width (see useFitText.ts) and styled per
 * `coverTextStyle` (see CoverTextStyleEditor.tsx, opened via the palette
 * button next to Change/Remove).
 */
export function CoverImage({ workspaceId, objectId, cover, canEdit, title, onTitleChange, coverTextStyle, icon }: CoverImageProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [hover, setHover] = useState(false);
  const [styleEditorOpen, setStyleEditorOpen] = useState(false);

  const setCoverMutation = useMutation({
    mutationFn: (newCover: string | null) => objectApi.update(objectId, { cover: newCover }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["object", objectId] }),
  });

  const [style, setStyle] = useDebouncedSave(coverTextStyle ?? DEFAULT_COVER_TEXT_STYLE, (value) =>
    objectApi.update(objectId, { coverTextStyle: value }).then(() => undefined),
  );

  const displayTitle = title || "Untitled";
  const { fontSize, measureRef, containerRef: overlayRef } = useFitText({
    text: displayTitle,
    fontFamily: style.fontFamily,
    bold: style.bold,
    italic: style.italic,
    uppercase: style.uppercase,
  });

  async function applyCover(value: string | null) {
    const previousCover = cover;
    await setCoverMutation.mutateAsync(value);
    const oldFileId = previousCover ? fileIdFromUrl(previousCover) : null;
    if (oldFileId) void fileApi.remove(oldFileId).catch(() => {});
  }

  async function handleUpload(file: File) {
    const asset = await fileApi.upload(workspaceId, file, objectId);
    await applyCover(fileApi.downloadUrl(asset.id));
  }

  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*"
      className="hidden"
      onChange={async (e) => {
        const file = e.target.files?.[0];
        if (file) await handleUpload(file);
      }}
    />
  );

  if (!cover) {
    if (!canEdit) return null;
    return (
      <div className="mx-auto max-w-5xl px-4 pt-4 sm:px-8">
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-surface-raised hover:text-ink"
        >
          <Icon name="image" className="h-3.5 w-3.5" /> Add cover
        </button>
        {fileInput}
      </div>
    );
  }

  const textCss = coverTextCss(style);

  return (
    <div className="relative w-full" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <img src={withShareToken(cover)} alt="" className="max-h-[300px] w-full object-cover" />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 px-6">
        <div className="pointer-events-auto mx-auto flex max-w-full items-center justify-center gap-2">
          {/* Fixed-size, unlike the title next to it - useFitText below
              already accounts for it by measuring `overlayRef`'s *own*
              width, which this flex row only leaves it once this has taken
              its share. */}
          <div className="shrink-0">{icon}</div>
          <div ref={overlayRef} className="min-w-0 flex-1">
            {/* Unconstrained, invisible twin of the title text - its natural
                width at a fixed baseline size is what useFitText scales
                against to make the real title span exactly this container. */}
            <span
              ref={measureRef}
              aria-hidden
              style={{
                position: "absolute",
                visibility: "hidden",
                whiteSpace: "nowrap",
                fontSize: 16,
                fontFamily: textCss.fontFamily,
                fontWeight: textCss.fontWeight,
                fontStyle: textCss.fontStyle,
                textTransform: textCss.textTransform,
              }}
            >
              {displayTitle}
            </span>
            {canEdit ? (
              <input
                value={title}
                onChange={(e) => onTitleChange(e.target.value)}
                placeholder="Untitled"
                className="w-full border-none bg-transparent text-center outline-none"
                style={{ ...textCss, fontSize }}
              />
            ) : (
              <div className="w-full truncate text-center" style={{ ...textCss, fontSize }}>
                {displayTitle}
              </div>
            )}
          </div>
        </div>
      </div>

      {hover && canEdit && (
        <div className="absolute right-3 top-3 flex gap-1.5">
          <button
            onClick={() => setStyleEditorOpen((v) => !v)}
            className="rounded-md bg-surface/90 px-2 py-1 text-xs text-ink shadow hover:bg-surface"
            title="Title text style"
          >
            <Icon name="palette" className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="rounded-md bg-surface/90 px-2 py-1 text-xs text-ink shadow hover:bg-surface"
          >
            Change
          </button>
          <button
            onClick={() => applyCover(null)}
            className="rounded-md bg-surface/90 px-2 py-1 text-xs text-ink shadow hover:bg-red-500/10 hover:text-red-500"
          >
            Remove
          </button>
        </div>
      )}
      {styleEditorOpen && <CoverTextStyleEditor style={style} onChange={setStyle} onClose={() => setStyleEditorOpen(false)} />}
      {fileInput}
    </div>
  );
}
