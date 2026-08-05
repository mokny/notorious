/**
 * Tailwind class string that disables interactive edit controls within a
 * wrapped container without blocking `<a>`/`Link` navigation (sub-object/
 * relation links inside otherwise-read-only content still need to be
 * clickable - see SubObjectBlock.tsx, RelationPicker.tsx) or `data-view-toggle`
 * buttons (expand/collapse chevrons - see CollapsibleSection.tsx,
 * SubObjectBlock.tsx, ToggleBlock.tsx; those only reveal already-there
 * content, not an edit). `canvas` covers the whiteboard block (Excalidraw
 * draws/handles pointer events directly on a `<canvas>`, not an input/
 * button). The `locked-content` class (see globals.css) additionally hides
 * hover-revealed and always-visible edit affordances entirely (drag handles,
 * add/delete buttons, "+ Add item") instead of leaving them visible-but-inert.
 *
 * `pointer-events: none` is skipped for text content that's already made
 * genuinely non-editable the correct way instead: a native `readonly`
 * attribute (ChecklistBlock.tsx's item text) or TipTap's own `editable`
 * state, which renders as `contenteditable="false"` (every rich-text block -
 * see useMarkdownEditor.ts). Both already block edits on their own and, unlike
 * `pointer-events: none`, don't also block text selection/copying - which
 * a locked object should still allow. Everything else here (property
 * inputs, the title field, ...) has no such native read-only state, so it
 * still falls back to `pointer-events: none`.
 *
 * The whiteboard block's own canvas gets a narrower carve-out on top of the
 * blanket `[&_canvas]:pointer-events-none` above: WhiteboardBlock.tsx already
 * gates *drawing* itself via Excalidraw's own `viewModeEnabled` prop (which,
 * unlike a CSS `pointer-events: none`, still allows panning/zooming the
 * canvas) - see its `canDraw`. A blanket `pointer-events: none` on top of
 * that would additionally kill panning/zooming for everyone, including the
 * owner, which `viewModeEnabled` never does on its own. WhiteboardBlock.tsx
 * marks its canvas's wrapper with `data-pannable`, and the second selector
 * below (more specific than the first, so it wins regardless of rule order)
 * restores pointer events there - `viewModeEnabled` is left to do the actual
 * fine-grained gating.
 *
 * Shared by ObjectDetailPage.tsx (a locked object, or a read-only share) and
 * BlockEditor.tsx (an embedded sub-object's content, which is always
 * read-only regardless of the host object's own lock state - see its
 * `readOnly`/`isEmbedded`).
 */
export const READ_ONLY_CONTENT_CLASS =
  "locked-content [&_input:not([readonly])]:pointer-events-none [&_textarea:not([readonly])]:pointer-events-none [&_select]:pointer-events-none [&_button:not([data-view-toggle])]:pointer-events-none [&_[contenteditable=true]]:pointer-events-none [&_canvas]:pointer-events-none [&_[data-pannable]_canvas]:pointer-events-auto";
