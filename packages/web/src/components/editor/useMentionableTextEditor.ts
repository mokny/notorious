import { useEffect, useMemo, useRef } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import type { EditorView } from "@tiptap/pm/view";
import { Mention, mentionPluginKey } from "./Mention.js";
import { MentionNode } from "./MentionNode.js";

interface UseMentionableTextEditorOptions {
  markdown: string;
  workspaceId: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  editable?: boolean;
  onBlur?: () => void;
  onFocus?: () => void;
  /**
   * Called instead of inserting anything when Enter (no Shift) is pressed -
   * e.g. ChecklistBlock's "Enter adds a new item below" behavior. When
   * omitted, plain Enter inserts a hard line break (matching a plain
   * `<textarea>`'s own Enter) unless `singleLine` is set, in which case Enter
   * is just swallowed (matching a plain `<input>`, which doesn't add a
   * newline either).
   */
  onEnter?: () => void;
  singleLine?: boolean;
}

/**
 * A minimal TipTap instance for plain-text-with-@mentions surfaces (comment
 * bodies, text/long-text property values, checklist items) - unlike
 * useMarkdownEditor.ts's full block editor, every formatting extension is
 * stripped down to just a single paragraph of plain text (no bold/italic/
 * lists/headings/links/slash-command), plus the same MentionNode/Mention
 * pair the block editor uses. That's the whole point of this hook: a plain
 * `<textarea>`/`<input>` can only ever show the raw `@[Name|id]` storage
 * syntax verbatim (see utils/mentions.ts) - this renders it as a live
 * `@Name` pill while typing, the same as the block editor.
 */
export function useMentionableTextEditor(options: UseMentionableTextEditorOptions) {
  const onChangeRef = useRef(options.onChange);
  const onBlurRef = useRef(options.onBlur);
  const onFocusRef = useRef(options.onFocus);
  const onEnterRef = useRef(options.onEnter);
  const workspaceIdRef = useRef(options.workspaceId);
  const editableRef = useRef(options.editable ?? true);
  const singleLineRef = useRef(options.singleLine ?? false);
  onChangeRef.current = options.onChange;
  onBlurRef.current = options.onBlur;
  onFocusRef.current = options.onFocus;
  onEnterRef.current = options.onEnter;
  workspaceIdRef.current = options.workspaceId;
  editableRef.current = options.editable ?? true;
  singleLineRef.current = options.singleLine ?? false;

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
        bold: false,
        italic: false,
        strike: false,
        code: false,
      }),
      Placeholder.configure({ placeholder: options.placeholder ?? "" }),
      Markdown.configure({ html: false, transformPastedText: true }),
      MentionNode,
      Mention.configure({ workspaceIdRef }),
    ],
    [options.placeholder],
  );

  const editorProps = useMemo(
    () => ({
      // Same view-level-`handleKeyDown`-wins-over-plugins pattern as
      // useMarkdownEditor.ts's own override - see its doc comment for why
      // this has to be a view prop, not a plugin/keyboard-shortcut, to
      // reliably step aside while the mention popup is open.
      handleKeyDown: (view: EditorView, event: KeyboardEvent) => {
        const suggestionOpen = Boolean((mentionPluginKey.getState(view.state) as { active?: boolean } | undefined)?.active);
        if (suggestionOpen) return false;
        if (event.key === "Enter" && !event.shiftKey) {
          if (onEnterRef.current) {
            onEnterRef.current();
            return true;
          }
          if (singleLineRef.current) return true;
          const hardBreak = view.state.schema.nodes.hardBreak;
          if (hardBreak) view.dispatch(view.state.tr.replaceSelectionWith(hardBreak.create()).scrollIntoView());
          return true;
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
    editable: options.editable ?? true,
    onUpdate: ({ editor: updatedEditor }) => {
      if (!editableRef.current) return;
      const storage = updatedEditor.storage as { markdown: { getMarkdown: () => string } };
      onChangeRef.current?.(storage.markdown.getMarkdown());
    },
    onBlur: () => onBlurRef.current?.(),
    onFocus: () => onFocusRef.current?.(),
  });

  useEffect(() => {
    editor?.setEditable(options.editable ?? true, false);
  }, [options.editable, editor]);

  // Same "only push external content in while idle" caveat as
  // useMarkdownEditor.ts's identical effect - overwriting mid-edit would
  // fight the user's own cursor/typing.
  useEffect(() => {
    if (!editor || editor.isFocused) return;
    const storage = editor.storage as { markdown: { getMarkdown: () => string } };
    if (storage.markdown.getMarkdown() === options.markdown) return;
    editor.commands.setContent(options.markdown, false);
  }, [options.markdown, editor]);

  return editor;
}
