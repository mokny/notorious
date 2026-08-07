import { useEffect, useState } from "react";
import { useBlockEditor } from "./BlockEditorContext.js";

/**
 * Drives "raw {{ }}/{% %} source while focused, rendered value once
 * unfocused" for one templatable field (`field` matches the key used by
 * modules/templates/renderer.ts on the server, e.g. "markdown",
 * "summaryMarkdown", "items.2", "rows.0.1") - shared by TemplatableMarkdown.tsx
 * (rich-text fields) and ChecklistBlock.tsx/TableBlock.tsx (plain
 * inputs/textareas). `rendered` is `undefined` when the field has no
 * template syntax at all, or while `renderedBlocks` is still loading - in
 * either case there's nothing to switch to, so `showRendered` stays false
 * and the field just behaves like a normal editable field.
 *
 * A read-only field (locked object, embedded preview, or a share visitor -
 * see BlockEditorContext.tsx's `readOnly`) always shows the rendered value
 * when one exists, since there's no edit mode for it to switch into.
 */
export function useTemplatableField(blockId: string, field: string, autoFocus?: boolean) {
  const { readOnly, renderedBlocks, renderedBlocksLoading } = useBlockEditor();
  const rendered = renderedBlocks?.[blockId]?.[field];
  const [editing, setEditing] = useState(Boolean(autoFocus) && !renderedBlocksLoading);

  useEffect(() => {
    if (autoFocus && !renderedBlocksLoading) setEditing(true);
  }, [autoFocus, renderedBlocksLoading]);

  return {
    rendered,
    showRendered: rendered !== undefined && (readOnly || !editing),
    // Suppressed while renderedBlocks is still loading, so a field that's
    // about to auto-focus doesn't briefly flash its raw `{{ }}` source with
    // TemplateSuggestion's cursor-position popup before the rendered value
    // (or lack thereof) is known - see BlockEditorContext.tsx's
    // `renderedBlocksLoading` doc comment.
    effectiveAutoFocus: Boolean(autoFocus) && !renderedBlocksLoading,
    startEditing: () => {
      if (!readOnly) setEditing(true);
    },
    stopEditing: () => setEditing(false),
  };
}
