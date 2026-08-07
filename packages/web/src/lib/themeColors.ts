/** Matches globals.css's `--surface` token for each theme - kept in sync by hand with the inline bootstrap script in index.html (which can't import this module, since it runs before any bundled code). */
export const THEME_COLORS = {
  light: "#ffffff",
  dark: "#0f111a",
} as const;
