/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  future: {
    // Every `hover:` class app-wide (not just group-hover reveal patterns
    // like PinnedNavItem.tsx's - plain `hover:bg-surface`/`hover:text-ink`
    // on a link, e.g. navLinkClass.ts, has the exact same problem) only
    // applies under `@media (hover: hover) and (pointer: fine)` with this
    // on. Without it, a touch browser treats the first tap on *any*
    // `:hover`-styled element as simulating that hover instead of
    // following through to a click/navigation - a second tap is then
    // needed to actually activate it, which is what made sidebar
    // navigation (and anything else with a `hover:` class) take two taps
    // on a phone. Desktop mouse/trackpad hover is completely unaffected.
    hoverOnlyWhenSupported: true,
  },
  theme: {
    extend: {
      colors: {
        surface: {
          DEFAULT: "rgb(var(--surface) / <alpha-value>)",
          raised: "rgb(var(--surface-raised) / <alpha-value>)",
        },
        ink: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          muted: "rgb(var(--ink-muted) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
        },
        border: "rgb(var(--border) / <alpha-value>)",
        "chat-bubble": "rgb(var(--chat-bubble) / <alpha-value>)",
      },
      borderRadius: {
        xl: "0.875rem",
      },
      backdropBlur: {
        xs: "2px",
      },
    },
  },
  plugins: [],
};
