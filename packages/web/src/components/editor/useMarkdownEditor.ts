import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import type { BlockType } from "@notorious/shared";
import { SlashCommand } from "./SlashCommand.js";

interface UseMarkdownEditorOptions {
  markdown: string;
  placeholder?: string;
  onChange: (markdown: string) => void;
  onEnter?: () => void;
  onBackspaceEmpty?: () => void;
  onSlashSelect?: (type: BlockType) => void;
}

/**
 * One TipTap instance per rich-text block. Each block holds a single
 * paragraph of inline content (bold/italic/code/link) - block-level
 * structure (headings, lists, tables, ...) is modeled as separate block rows
 * instead of nested ProseMirror nodes, so Enter always means "new block".
 */
export function useMarkdownEditor(options: UseMarkdownEditorOptions) {
  return useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        hardBreak: false,
      }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: options.placeholder ?? "Type '/' for commands…" }),
      Markdown.configure({ html: false, transformPastedText: true }),
      ...(options.onSlashSelect
        ? [SlashCommand.configure({ onSelect: options.onSlashSelect })]
        : []),
    ],
    content: options.markdown,
    editorProps: {
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && !event.shiftKey) {
          options.onEnter?.();
          return true;
        }
        if (event.key === "Backspace" && isEmptyEditor(event.target as HTMLElement)) {
          options.onBackspaceEmpty?.();
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      const storage = editor.storage as { markdown: { getMarkdown: () => string } };
      options.onChange(storage.markdown.getMarkdown().trim());
    },
  });
}

function isEmptyEditor(target: HTMLElement): boolean {
  return target.textContent?.trim().length === 0;
}
