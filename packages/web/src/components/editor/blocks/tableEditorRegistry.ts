import type { Editor } from "@tiptap/react";

/**
 * blockId -> the live TipTap editor instance behind that table block's
 * EditableTable (see TableBlock.tsx) - lets BlockContextMenu.tsx's "Clear
 * formatting" item reach into the table's own editor and run a real TipTap
 * command (`unsetAllMarks`/`setTextAlign`), which a block-agnostic
 * `document.execCommand` can't do without risking a ProseMirror/DOM state
 * mismatch (see BlockContextMenu.tsx's Copy/Cut, which only ever use
 * `execCommand` for the read-only `copy`, never a DOM-mutating command).
 * Only ever holds an *editable* table's editor - ReadOnlyTable never
 * registers here, matching the menu never opening on a locked/read-only
 * block in the first place (see BlockItem.tsx's `readOnly` guard).
 */
const registry = new Map<string, Editor>();

export function registerTableEditor(blockId: string, editor: Editor): void {
  registry.set(blockId, editor);
}

export function unregisterTableEditor(blockId: string, editor: Editor): void {
  if (registry.get(blockId) === editor) registry.delete(blockId);
}

export function getTableEditor(blockId: string): Editor | undefined {
  return registry.get(blockId);
}
