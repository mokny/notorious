import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { CoverTextStyle } from "@notorious/shared";
import { objectApi, fileApi } from "../lib/api/resources.js";
import { withShareToken } from "../lib/api/shareMode.js";
import { useDebouncedSave } from "../hooks/useDebouncedSave.js";
import { useFitText } from "../hooks/useFitText.js";
import { DEFAULT_COVER_TEXT_STYLE, coverTextCss } from "../lib/coverTextStyle.js";
import { CoverTextStyleEditor } from "./CoverTextStyleEditor.js";
import { Icon } from "./ui/Icon.js";
import { useTheme } from "../context/ThemeContext.js";
import { useMobileChrome } from "../context/MobileChromeContext.js";
import { THEME_COLORS } from "../lib/themeColors.js";

interface CoverImageProps {
  workspaceId: string;
  objectId: string;
  cover: string | null;
  canEdit: boolean;
  title: string;
  onTitleChange: (value: string) => void;
  coverTextStyle: CoverTextStyle | null;
  /** Renders the object's icon (IconPicker if editable, a plain Icon otherwise - see ObjectDetailPage.tsx) at the given pixel size, beside the title overlay - called with the title's own auto-fit font size so the icon visually matches it. */
  icon: (size: number) => ReactNode;
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
  const { theme } = useTheme();
  const { setCoverActive } = useMobileChrome();

  // Tells WorkspaceLayout's mobile header to switch to its transparent
  // overlay style while this cover is on screen, and restores the Dynamic
  // Island color to the plain theme color (set by handleImageLoad below in
  // the meantime) once it isn't - on unmount (covers a real cover being
  // removed too, since setCoverMutation's onSuccess invalidates the object
  // query and this whole component gets a fresh `key` per object, see
  // ObjectDetailPage.tsx) and whenever `cover` itself goes null.
  useEffect(() => {
    if (!cover) return;
    setCoverActive(true);
    return () => {
      setCoverActive(false);
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLORS[theme]);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cover]);

  // Approximates the cover's dominant color by downsampling it onto a tiny
  // canvas and averaging the pixels - cheap, and close enough for a status
  // bar tint (no need for a real clustering algorithm here).
  function handleImageLoad(e: SyntheticEvent<HTMLImageElement>) {
    try {
      const img = e.currentTarget;
      const size = 8;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, size, size);
      const { data } = ctx.getImageData(0, 0, size, size);
      let r = 0;
      let g = 0;
      let b = 0;
      const pixelCount = data.length / 4;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i] ?? 0;
        g += data[i + 1] ?? 0;
        b += data[i + 2] ?? 0;
      }
      const toHex = (n: number) => Math.round(n / pixelCount).toString(16).padStart(2, "0");
      const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
      document.querySelector('meta[name="theme-color"]')?.setAttribute("content", hex);
    } catch {
      // A non-same-origin cover would taint the canvas and make
      // getImageData throw - falls back to just leaving the theme's own
      // status-bar color in place. Covers are always same-origin uploads
      // (see fileIdFromUrl above), so this is only a safety net.
    }
  }

  const setCoverMutation = useMutation({
    mutationFn: (newCover: string | null) => objectApi.update(objectId, { cover: newCover }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["object", objectId] }),
  });

  const [style, setStyle] = useDebouncedSave(coverTextStyle ?? DEFAULT_COVER_TEXT_STYLE, (value) =>
    objectApi.update(objectId, { coverTextStyle: value }).then(() => undefined),
  );

  const displayTitle = title || "Untitled";
  const iconRef = useRef<HTMLDivElement>(null);
  const { fontSize, measureRef, containerRef: rowRef } = useFitText({
    text: displayTitle,
    fontFamily: style.fontFamily,
    bold: style.bold,
    italic: style.italic,
    uppercase: style.uppercase,
    // The icon sits beside the title in the same row (see `rowRef` below,
    // attached to that whole row rather than just the title's own flex-1
    // slot) - its current width plus the `gap-2` between them (0.5rem/8px)
    // is what's *not* actually available to the title text.
    reservedWidth: () => (iconRef.current?.getBoundingClientRect().width ?? 0) + 8,
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
    <div
      className="relative w-full"
      // Pulls the cover back up underneath WorkspaceLayout.tsx's mobile
      // header - <main> there gets a matching padding-top so everything
      // *after* this element still lands exactly where it would without
      // this margin (see MOBILE_HEADER_HEIGHT's own comment). Resolves to a
      // no-op (var falls back to 0px) wherever that padding isn't set - the
      // persistent-sidebar breakpoints, and desktop, where there's no
      // floating header to duck under in the first place.
      style={{ marginTop: "calc(-1 * var(--mobile-header-h, 0px))" }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <img src={withShareToken(cover)} alt="" className="max-h-[300px] w-full object-cover" onLoad={handleImageLoad} />

      <div className="pointer-events-none absolute inset-x-0 bottom-0 px-6">
        <div ref={rowRef} className="pointer-events-auto mx-auto flex max-w-full items-center justify-center gap-2">
          {/* Sized to match the title's own (auto-fit) font size, so it
              scales with it instead of looking tiny next to a huge title or
              oversized next to a small one. `rowRef` above (not this div)
              is what useFitText observes for resizes, with this icon's own
              width subtracted separately (see `reservedWidth`) - observing
              *this* row's flex-1 sibling directly would mean growing the
              icon (a side effect of the very fontSize it's fed) shrinks
              what's measured here, computing a smaller fontSize, shrinking
              the icon, growing what's measured, computing a larger
              fontSize again... measuring the whole (icon-size-independent)
              row instead breaks that loop, which is what made the title
              flicker/jitter vertically before this. */}
          <div ref={iconRef} className="shrink-0">
            {icon(fontSize)}
          </div>
          <div className="min-w-0 flex-1">
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
