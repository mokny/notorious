import { useEffect } from "react";
import type { Editor } from "@tiptap/react";

/**
 * blockId -> the live TipTap editor instance behind that block's own
 * rich-text field (a table's EditableTable, or the markdown-based
 * paragraph/heading/quote/callout/toggle/ai editor via RichTextEditor.tsx) -
 * lets BlockContextMenu.tsx's "Clear formatting" item reach into that
 * editor and run a real TipTap command (`unsetAllMarks`, and
 * `setTextAlign` where the extension is loaded), which a block-agnostic
 * `document.execCommand` can't do without risking a ProseMirror/DOM state
 * mismatch (see BlockContextMenu.tsx's Copy/Cut, which only ever use
 * `execCommand` for the read-only `copy`, never a DOM-mutating command).
 *
 * Blocks with no formatting marks at all (checklist items, comments,
 * text/long-text property values - see useMentionableTextEditor.ts, which
 * explicitly strips bold/italic/strike/code) never register here, so
 * "Clear formatting" simply doesn't appear for them - there'd be nothing to
 * clear. A read-only rendered instance (a templated field's evaluated
 * display, or any block while the object is locked) doesn't register
 * either, matching the menu never opening on a locked/read-only block in
 * the first place (see BlockItem.tsx's `readOnly` guard).
 */
const registry = new Map<string, Editor>();

export function registerBlockEditor(blockId: string, editor: Editor): void {
  registry.set(blockId, editor);
}

export function unregisterBlockEditor(blockId: string, editor: Editor): void {
  if (registry.get(blockId) === editor) registry.delete(blockId);
}

export function getBlockEditor(blockId: string): Editor | undefined {
  return registry.get(blockId);
}

/**
 * Registers `editor` under `blockId` for as long as it lives, re-registering
 * on every focus - the one thing that matters for a block whose field can
 * mount several editors under the same block id at once (none currently do;
 * kept for that case rather than a create-once registration, since a
 * focus-driven "most recently used" entry is the more useful one for a
 * context menu regardless). A no-op while either argument is missing (a
 * read-only instance that deliberately isn't passed a `blockId`, see
 * RichTextEditor.tsx/TemplatableMarkdown.tsx).
 */
export function useRegisterBlockEditor(blockId: string | undefined, editor: Editor | null): void {
  useEffect(() => {
    if (!blockId || !editor) return;
    registerBlockEditor(blockId, editor);
    const handleFocus = () => registerBlockEditor(blockId, editor);
    editor.on("focus", handleFocus);
    return () => {
      editor.off("focus", handleFocus);
      unregisterBlockEditor(blockId, editor);
    };
  }, [blockId, editor]);
}
