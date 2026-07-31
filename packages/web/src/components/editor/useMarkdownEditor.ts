import { useEffect, useMemo, useRef } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import type { BlockType, ObjectType } from "@notorious/shared";
import { SlashCommand } from "./SlashCommand.js";

interface UseMarkdownEditorOptions {
  markdown: string;
  placeholder?: string;
  onChange: (markdown: string) => void;
  onEnter?: () => void;
  onBackspaceEmpty?: () => void;
  onSlashSelect?: (type: BlockType, extraContent?: Record<string, unknown>) => void;
  /** For the slash menu's per-object-type "create a new X" entries - see SlashCommand.ts. */
  objectTypes?: ObjectType[];
}

function isEmptyEditor(target: HTMLElement): boolean {
  return target.textContent?.trim().length === 0;
}

/**
 * One TipTap instance per rich-text block. Each block holds a single
 * paragraph of inline content (bold/italic/code/link) - block-level
 * structure (headings, lists, tables, ...) is modeled as separate block rows
 * instead of nested ProseMirror nodes, so Enter always means "new block"
 * (Shift+Enter still inserts a soft line break within the block, via the
 * stock hardBreak extension).
 *
 * The extensions/editorProps objects are memoized so they don't change
 * identity on every parent re-render: TipTap's `useEditor` re-applies
 * `editor.setOptions()`/`view.setProps()` whenever any option's reference
 * changes, and doing that on every keystroke-triggered re-render was the
 * root cause of occasional dropped characters (a ProseMirror view prop
 * update landing mid-keystroke). Callbacks are read through refs instead of
 * being part of the dependency surface, so they're always current without
 * forcing a re-create.
 */
export function useMarkdownEditor(options: UseMarkdownEditorOptions) {
  const onChangeRef = useRef(options.onChange);
  const onEnterRef = useRef(options.onEnter);
  const onBackspaceEmptyRef = useRef(options.onBackspaceEmpty);
  const onSlashSelectRef = useRef(options.onSlashSelect);
  // Read at call-time by the extension (see SlashCommand.ts's `objectTypesRef`
  // param), not just when it's configured below - object types can still be
  // loading (or change) after this editor instance is created.
  const objectTypesRef = useRef<ObjectType[]>(options.objectTypes ?? []);

  onChangeRef.current = options.onChange;
  onEnterRef.current = options.onEnter;
  onBackspaceEmptyRef.current = options.onBackspaceEmpty;
  onSlashSelectRef.current = options.onSlashSelect;
  objectTypesRef.current = options.objectTypes ?? [];

  const hasSlashCommand = Boolean(options.onSlashSelect);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      Link.configure({ openOnClick: false }),
      Placeholder.configure({ placeholder: options.placeholder ?? "Type '/' for commands…" }),
      Markdown.configure({ html: false, transformPastedText: true }),
      ...(hasSlashCommand
        ? [
            SlashCommand.configure({
              onSelect: (type, extraContent) => onSlashSelectRef.current?.(type, extraContent),
              objectTypesRef,
            }),
          ]
        : []),
    ],
    [options.placeholder, hasSlashCommand],
  );

  const editorProps = useMemo(
    () => ({
      handleKeyDown: (_view: unknown, event: KeyboardEvent) => {
        if (event.key === "Enter" && !event.shiftKey) {
          onEnterRef.current?.();
          return true;
        }
        if (event.key === "Backspace" && isEmptyEditor(event.target as HTMLElement)) {
          onBackspaceEmptyRef.current?.();
        }
        return false;
      },
    }),
    [],
  );

  const editor = useEditor({
    extensions,
    content: options.markdown,
    editorProps,
    onUpdate: ({ editor: updatedEditor }) => {
      const storage = updatedEditor.storage as { markdown: { getMarkdown: () => string } };
      onChangeRef.current?.(storage.markdown.getMarkdown().trim());
    },
  });

  // `content` above only seeds the editor once, on creation - by itself it
  // never notices later prop changes, so a block another collaborator (or
  // this same account's other tab) edits stays frozen at whatever it showed
  // when this component first mounted, even though the query cache behind it
  // has already moved on. Push those external changes in explicitly, but
  // only while this editor is idle: if the user has it focused, they're the
  // one actively typing, and overwriting mid-edit would fight their cursor.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const storage = editor.storage as { markdown: { getMarkdown: () => string } };
    if (storage.markdown.getMarkdown().trim() === options.markdown.trim()) return;
    editor.commands.setContent(options.markdown, false);
  }, [options.markdown, editor]);

  return editor;
}
