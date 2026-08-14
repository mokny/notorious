import { useEffect } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import { useMentionableTextEditor } from "./useMentionableTextEditor.js";

interface MentionableEditorProps {
  value: string;
  onChange: (value: string) => void;
  workspaceId: string;
  placeholder?: string;
  className?: string;
  editable?: boolean;
  onBlur?: () => void;
  onFocus?: () => void;
  onEnter?: () => void;
  singleLine?: boolean;
  /** Fires with the underlying TipTap editor instance once created (and with `null` on unmount) - for callers that need to imperatively `.commands.focus()` it, e.g. ChecklistBlock.tsx's per-item focus management (a plain `<textarea>` ref's `.focus()` equivalent). */
  onEditorReady?: (editor: Editor | null) => void;
}

/**
 * Drop-in `<textarea>`/`<input>` replacement for any plain-text-with-
 * @mentions surface (comments, text/long-text properties, checklist items) -
 * see useMentionableTextEditor.ts for why this exists instead of the plain
 * DOM element. `className` is applied to the contenteditable element itself,
 * same as it would be on a real `<textarea>`/`<input>` - style it the same
 * way (border/padding/background), TipTap's default styling is unopinionated.
 */
export function MentionableEditor({
  value,
  onChange,
  workspaceId,
  placeholder,
  className,
  editable,
  onBlur,
  onFocus,
  onEnter,
  singleLine,
  onEditorReady,
}: MentionableEditorProps) {
  const editor = useMentionableTextEditor({
    markdown: value,
    onChange,
    workspaceId,
    placeholder,
    editable,
    onBlur,
    onFocus,
    onEnter,
    singleLine,
  });

  useEffect(() => {
    onEditorReady?.(editor ?? null);
    return () => onEditorReady?.(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  return <EditorContent editor={editor} className={className} />;
}
