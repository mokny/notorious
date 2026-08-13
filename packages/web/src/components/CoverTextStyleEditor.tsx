import { useRef } from "react";
import type { CoverTextStyle } from "@notorious/shared";
import { FONT_FAMILY_OPTIONS } from "../lib/coverTextStyle.js";
import { useClickOutside } from "../hooks/useClickOutside.js";

/**
 * Configures the styling of the title overlaid on a cover image - see
 * CoverImage.tsx / CoverMenuItem.tsx, which own the debounced save and pass
 * the current draft style down as `style`.
 *
 * `variant="popover"` (default) is CoverImage.tsx's desktop hover overlay -
 * self-positioned, closes on outside click. `variant="inline"` is
 * CoverMenuItem.tsx's mobile accordion row - plain block content, no
 * positioning/outside-click handling of its own (already inside a Modal).
 */
export function CoverTextStyleEditor({
  style,
  onChange,
  onClose,
  variant = "popover",
}: {
  style: CoverTextStyle;
  onChange: (style: CoverTextStyle) => void;
  onClose: () => void;
  variant?: "popover" | "inline";
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  useClickOutside(containerRef, onClose, variant === "popover");

  function set<K extends keyof CoverTextStyle>(key: K, value: CoverTextStyle[K]): void {
    onChange({ ...style, [key]: value });
  }

  return (
    <div
      ref={containerRef}
      className={
        variant === "popover"
          ? "absolute right-3 top-14 z-20 w-64 space-y-3 rounded-lg border border-border bg-surface-raised p-3 text-sm text-ink shadow-lg"
          : "space-y-3 text-sm text-ink"
      }
    >
      <div className="flex items-center gap-2">
        <label className="flex-1 text-xs text-ink-muted">Text color</label>
        <input type="color" value={style.color} onChange={(e) => set("color", e.target.value)} className="h-6 w-8" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-ink-muted">Text opacity</label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={style.opacity}
          onChange={(e) => set("opacity", Number(e.target.value))}
          className="w-full"
        />
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={style.shadow} onChange={(e) => set("shadow", e.target.checked)} />
        Drop shadow
      </label>

      <div className="border-t border-border pt-2">
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={style.backgroundEnabled}
            onChange={(e) => set("backgroundEnabled", e.target.checked)}
          />
          Background behind text
        </label>
        {style.backgroundEnabled && (
          <div className="mt-2 space-y-2 pl-5">
            <div className="flex items-center gap-2">
              <label className="flex-1 text-xs text-ink-muted">Background color</label>
              <input
                type="color"
                value={style.backgroundColor}
                onChange={(e) => set("backgroundColor", e.target.value)}
                className="h-6 w-8"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-ink-muted">Background opacity</label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={style.backgroundOpacity}
                onChange={(e) => set("backgroundOpacity", Number(e.target.value))}
                className="w-full"
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-1 border-t border-border pt-2">
        <label className="text-xs text-ink-muted">Font</label>
        <select
          value={style.fontFamily}
          onChange={(e) => set("fontFamily", e.target.value as CoverTextStyle["fontFamily"])}
          className="w-full rounded-md border border-border bg-surface px-2 py-1 text-sm"
        >
          {FONT_FAMILY_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex gap-3 border-t border-border pt-2 text-xs">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={style.bold} onChange={(e) => set("bold", e.target.checked)} />
          Bold
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={style.italic} onChange={(e) => set("italic", e.target.checked)} />
          Italic
        </label>
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={style.uppercase} onChange={(e) => set("uppercase", e.target.checked)} />
          Uppercase
        </label>
      </div>
    </div>
  );
}
