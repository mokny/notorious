import type { CSSProperties } from "react";
import type { CoverTextStyle } from "@notorious/shared";

/** White, bold, drop-shadowed - a reasonable default that stays readable on top of an arbitrary photo without the user having to configure anything first. */
export const DEFAULT_COVER_TEXT_STYLE: CoverTextStyle = {
  color: "#ffffff",
  opacity: 1,
  shadow: true,
  backgroundEnabled: false,
  backgroundColor: "#000000",
  backgroundOpacity: 0.4,
  fontFamily: "default",
  bold: true,
  italic: false,
  uppercase: false,
};

export const FONT_FAMILY_OPTIONS: { value: CoverTextStyle["fontFamily"]; label: string; css: string }[] = [
  { value: "default", label: "Default", css: "inherit" },
  { value: "serif", label: "Serif", css: "Georgia, 'Times New Roman', serif" },
  { value: "sans-serif", label: "Sans-serif", css: "Helvetica, Arial, sans-serif" },
  { value: "monospace", label: "Monospace", css: "'Courier New', monospace" },
  { value: "cursive", label: "Cursive", css: "'Brush Script MT', cursive" },
];

/** `#rrggbb` + a 0-1 alpha -> `rgba(...)` - lets text color/opacity and background color/opacity vary independently, which a single CSS `opacity` on the whole element couldn't do (it would fade the background along with the text). */
function toRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const r = parseInt(normalized.slice(0, 2), 16) || 0;
  const g = parseInt(normalized.slice(2, 4), 16) || 0;
  const b = parseInt(normalized.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The visual (non-size) styling derived from a `CoverTextStyle` - font-size is computed separately by `useFitText` and merged in by the caller. */
export function coverTextCss(style: CoverTextStyle): CSSProperties {
  return {
    color: toRgba(style.color, style.opacity),
    textShadow: style.shadow ? "0 2px 10px rgba(0,0,0,0.75), 0 1px 3px rgba(0,0,0,0.9)" : "none",
    backgroundColor: style.backgroundEnabled ? toRgba(style.backgroundColor, style.backgroundOpacity) : "transparent",
    fontFamily: FONT_FAMILY_OPTIONS.find((option) => option.value === style.fontFamily)?.css ?? "inherit",
    fontWeight: style.bold ? 700 : 600,
    fontStyle: style.italic ? "italic" : "normal",
    textTransform: style.uppercase ? "uppercase" : "none",
    padding: style.backgroundEnabled ? "0.15em 0.5em" : undefined,
    borderRadius: style.backgroundEnabled ? "0.3em" : undefined,
  };
}
