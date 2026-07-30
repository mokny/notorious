import { useRef, useState } from "react";
import { fileApi } from "../lib/api/resources.js";
import { useClickOutside } from "../hooks/useClickOutside.js";
import { Icon } from "./ui/Icon.js";

const PRESET_EMOJI = [
  "📄", "📝", "📋", "✅", "🎯", "💡", "📌", "🔥", "⭐", "🚀", "📚", "🗂️",
  "📁", "🏷️", "💬", "👤", "🏢", "📅", "💰", "🎨", "🎵", "🎬", "🖼️", "🌐",
  "🔗", "📊", "🧠", "🛠️", "🎮", "☕", "🏠", "✈️",
];

/** Extracts the file id from a `fileApi.downloadUrl()`-shaped icon/cover value, so a replaced upload can clean up the one it's replacing. */
function fileIdFromUrl(url: string): string | null {
  return url.startsWith("/api/v1/files/") ? url.slice("/api/v1/files/".length) : null;
}

interface IconPickerProps {
  icon: string | null;
  fallbackIcon: string;
  /** Persists the new icon (null clears it back to `fallbackIcon`, e.g. an object type's default - not valid for a workspace, see `resettable`). */
  onChangeIcon: (icon: string | null) => Promise<void>;
  /** Uploads the file and resolves to the icon value (a `fileApi.downloadUrl()`-shaped URL) to persist. */
  onUploadIcon: (file: File) => Promise<string>;
  /** Shows a "Reset" button that clears back to `fallbackIcon` via `onChangeIcon(null)` - omit where null isn't a valid icon value (e.g. workspaces, which always need some icon set). */
  resettable?: boolean;
}

/** Lets you set something's icon from a preset emoji grid, any typed-in emoji, or an uploaded image - used for both objects (next to the title) and workspaces (Settings). */
export function IconPicker({ icon, fallbackIcon, onChangeIcon, onUploadIcon, resettable }: IconPickerProps) {
  const [open, setOpen] = useState(false);
  const [customEmoji, setCustomEmoji] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  useClickOutside(containerRef, () => setOpen(false), open);

  async function applyIcon(value: string | null) {
    const previousIcon = icon;
    await onChangeIcon(value);
    // Without this, every re-upload leaves the old file behind as an
    // orphan - nothing else ever references an icon's own file.
    const oldFileId = previousIcon ? fileIdFromUrl(previousIcon) : null;
    if (oldFileId) void fileApi.remove(oldFileId).catch(() => {});
    setOpen(false);
  }

  async function handleUpload(file: File) {
    const newIcon = await onUploadIcon(file);
    await applyIcon(newIcon);
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        title="Change icon"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg hover:bg-surface-raised"
      >
        <Icon name={icon ?? fallbackIcon} className="h-7 w-7" />
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-1 w-64 rounded-lg border border-border bg-surface-raised p-2 shadow-lg">
          <p className="mb-1.5 px-1 text-xs font-medium uppercase tracking-wide text-ink-muted">Choose an icon</p>
          <div className="grid grid-cols-8 gap-0.5">
            {PRESET_EMOJI.map((emoji) => (
              <button
                key={emoji}
                onClick={() => applyIcon(emoji)}
                className="flex h-7 w-7 items-center justify-center rounded-md text-lg hover:bg-surface"
              >
                {emoji}
              </button>
            ))}
          </div>

          <div className="mt-2 flex items-center gap-1 border-t border-border pt-2">
            <input
              value={customEmoji}
              onChange={(e) => setCustomEmoji(e.target.value)}
              placeholder="Paste any emoji…"
              maxLength={8}
              autoComplete="off"
              className="w-full min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-1 text-sm outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && customEmoji.trim()) applyIcon(customEmoji.trim());
              }}
            />
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-1 rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-surface hover:text-ink"
            >
              <Icon name="upload" className="h-3.5 w-3.5" /> Upload image
            </button>
            {resettable && icon && (
              <button
                onClick={() => applyIcon(null)}
                className="rounded-md px-2 py-1 text-xs text-ink-muted hover:bg-surface hover:text-red-500"
              >
                Reset
              </button>
            )}
          </div>

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
        </div>
      )}
    </div>
  );
}
