import { detectOverflow, type Modifier, type Options as PopperOptions } from "@popperjs/core";

/**
 * Popper's `flip`/`preventOverflow` (both already enabled by tippy.js by
 * default) only choose which side of the reference to render on and nudge
 * the popup back inside the viewport - neither shrinks it. `.slash-menu`'s
 * `max-h-80` (320px) is a fixed CSS cap, so on a short viewport (small
 * window, or a phone with the on-screen keyboard open) there's often no side
 * with 320px of room in either direction and the menu still hangs off the
 * edge. This modifier pair clamps it to whatever space is actually
 * available instead, so it always fits and scrolls internally
 * (`.slash-menu`'s own `overflow-y-auto`) rather than overflowing - the
 * documented Popper "maxSize" pattern (two modifiers because `state.styles`
 * writes have to happen in the later `beforeWrite` phase, after `maxSize`
 * itself has computed the number in `main`).
 */
const maxSize: Modifier<"maxSize", Record<string, never>> = {
  name: "maxSize",
  enabled: true,
  phase: "main",
  requiresIfExists: ["offset", "preventOverflow", "flip"],
  fn({ state }) {
    const overflow = detectOverflow(state, { padding: 8 });
    const { y } = state.modifiersData.preventOverflow ?? { y: 0 };
    const { height } = state.rects.popper;
    const [basePlacement] = state.placement.split("-");
    const heightProp = basePlacement === "top" ? "top" : "bottom";
    state.modifiersData.maxSize = { height: height - overflow[heightProp] - y };
  },
};

const applyMaxSize: Modifier<"applyMaxSize", Record<string, never>> = {
  name: "applyMaxSize",
  enabled: true,
  phase: "beforeWrite",
  requires: ["maxSize"],
  fn({ state }) {
    const { height } = state.modifiersData.maxSize as { height: number };
    state.styles.popper!.maxHeight = `${Math.max(height, 120)}px`;
  },
};

/** Shared `popperOptions` for the slash-command and template-suggestion
 * popups (SlashCommand.ts / TemplateSuggestion.ts) - keeps them fully on
 * screen by flipping/shifting inside the viewport and clamping their height
 * to available space. `padding: 8` mirrors the `8px` margin
 * `useKeepInViewport.ts` uses for the same purpose on React-owned popovers
 * elsewhere in the editor. */
export const popupPopperOptions: Partial<PopperOptions> = {
  modifiers: [
    { name: "flip", options: { padding: 8, fallbackPlacements: ["top-start", "bottom-end", "top-end"] } },
    { name: "preventOverflow", options: { padding: 8, altAxis: true } },
    maxSize,
    applyMaxSize,
  ],
};
