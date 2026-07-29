import { useEffect, useRef } from "react";
import { EditorContent } from "@tiptap/react";
import type { BlockType } from "@notorious/shared";
import { useMarkdownEditor } from "./useMarkdownEditor.js";

interface RichTextEditorProps {
  markdown: string;
  placeholder?: string;
  className?: string;
  onSave: (markdown: string) => Promise<void>;
  onEnter?: () => void;
  onBackspaceEmpty?: () => void;
  onSlashSelect?: (type: BlockType) => void;
  /** Focuses this editor once, then calls `onAutoFocused` - used after Enter creates a new block. */
  autoFocus?: boolean;
  onAutoFocused?: () => void;
}

const SAVE_DEBOUNCE_MS = 500;

/**
 * Debounces keystrokes into occasional PATCH requests instead of one per
 * character, and serializes them: a save is never sent while a previous one
 * for the same block is still in flight, and only the latest value is ever
 * sent. Without this, two overlapping requests can resolve out of order and
 * the older (shorter) one would win, silently reverting freshly typed text.
 */
export function RichTextEditor({
  markdown,
  placeholder,
  className,
  onSave,
  onEnter,
  onBackspaceEmpty,
  onSlashSelect,
  autoFocus,
  onAutoFocused,
}: RichTextEditorProps) {
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();
  const isSavingRef = useRef(false);
  const pendingValueRef = useRef<string | null>(null);
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;

  function flush() {
    if (isSavingRef.current) return;
    const value = pendingValueRef.current;
    if (value === null) return;
    pendingValueRef.current = null;
    isSavingRef.current = true;

    onSaveRef
      .current(value)
      .catch(() => {
        // The block editor surfaces failures via its own query error state;
        // this save loop just needs to keep going for the next value.
      })
      .finally(() => {
        isSavingRef.current = false;
        flush();
      });
  }

  const editor = useMarkdownEditor({
    markdown,
    placeholder,
    onEnter,
    onBackspaceEmpty,
    onSlashSelect,
    onChange: (value) => {
      pendingValueRef.current = value;
      clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
  });

  useEffect(() => () => clearTimeout(saveTimeout.current), []);

  useEffect(() => {
    if (autoFocus && editor) {
      editor.commands.focus("end");
      onAutoFocused?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus, editor]);

  return <EditorContent editor={editor} className={className} />;
}
