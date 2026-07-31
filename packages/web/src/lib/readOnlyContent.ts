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
 * Shared by ObjectDetailPage.tsx (a locked object, or a read-only share) and
 * BlockEditor.tsx (an embedded sub-object's content, which is always
 * read-only regardless of the host object's own lock state - see its
 * `readOnly`/`isEmbedded`).
 */
export const READ_ONLY_CONTENT_CLASS =
  "locked-content [&_input:not([readonly])]:pointer-events-none [&_textarea:not([readonly])]:pointer-events-none [&_select]:pointer-events-none [&_button:not([data-view-toggle])]:pointer-events-none [&_[contenteditable=true]]:pointer-events-none [&_canvas]:pointer-events-none";
