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
 * Shared by ObjectDetailPage.tsx (a locked object, or a read-only share) and
 * SubObjectBlock.tsx (an embedded sub-object's content, which is always
 * read-only regardless of the host object's own lock state).
 */
export const READ_ONLY_CONTENT_CLASS =
  "locked-content [&_input]:pointer-events-none [&_textarea]:pointer-events-none [&_select]:pointer-events-none [&_button:not([data-view-toggle])]:pointer-events-none [&_[contenteditable]]:pointer-events-none [&_canvas]:pointer-events-none";
