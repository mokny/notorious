import { useEffect, useRef } from "react";
import { EditorContent } from "@tiptap/react";
import type { BlockType } from "@notorious/shared";
import { useMarkdownEditor } from "./useMarkdownEditor.js";

interface RichTextEditorProps {
  markdown: string;
  placeholder?: string;
  className?: string;
  onSave: (markdown: string) => void;
  onEnter?: () => void;
  onBackspaceEmpty?: () => void;
  onSlashSelect?: (type: BlockType) => void;
}

const SAVE_DEBOUNCE_MS = 500;

/** Debounces keystrokes into occasional PATCH requests instead of one per character. */
export function RichTextEditor({ markdown, placeholder, className, onSave, onEnter, onBackspaceEmpty, onSlashSelect }: RichTextEditorProps) {
  const saveTimeout = useRef<ReturnType<typeof setTimeout>>();

  const editor = useMarkdownEditor({
    markdown,
    placeholder,
    onEnter,
    onBackspaceEmpty,
    onSlashSelect,
    onChange: (value) => {
      clearTimeout(saveTimeout.current);
      saveTimeout.current = setTimeout(() => onSave(value), SAVE_DEBOUNCE_MS);
    },
  });

  useEffect(() => () => clearTimeout(saveTimeout.current), []);

  return <EditorContent editor={editor} className={className} />;
}
