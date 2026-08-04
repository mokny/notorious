import { useEffect, useRef } from "react";
import { EditorContent } from "@tiptap/react";
import type { BlockType, ObjectType } from "@notorious/shared";
import { useMarkdownEditor } from "./useMarkdownEditor.js";
import { useBlockEditor } from "./BlockEditorContext.js";
import { useTemplateAutocompleteSchema } from "../../hooks/useTemplateAutocompleteSchema.js";

interface RichTextEditorProps {
  markdown: string;
  placeholder?: string;
  className?: string;
  onSave: (markdown: string) => Promise<void>;
  onEnter?: () => void;
  onBackspaceEmpty?: () => void;
  onSlashSelect?: (type: BlockType, extraContent?: Record<string, unknown>) => void;
  /** For the slash menu's per-object-type "create a new X" entries - see SlashCommand.ts. */
  objectTypes?: ObjectType[];
  /** Focuses this editor once, then calls `onAutoFocused` - used after Enter creates a new block. */
  autoFocus?: boolean;
  onAutoFocused?: () => void;
  /** See useMarkdownEditor.ts - defaults to true. */
  editable?: boolean;
  /** See useMarkdownEditor.ts. */
  onBlur?: () => void;
  /** See useMarkdownEditor.ts. */
  onFocus?: () => void;
  /**
   * Only set by TemplatableMarkdown.tsx's "edit" instance - adds
   * TemplateHighlight/TemplateSuggestion (see those files) so `{{ }}`/`{% %}`
   * syntax gets highlighted, inline error-checked, and autocompleted. Never
   * set on the "rendered" instance (that one shows already-evaluated text,
   * not template source).
   */
  templateAware?: boolean;
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
  objectTypes,
  autoFocus,
  onAutoFocused,
  editable,
  onBlur,
  onFocus,
  templateAware,
}: RichTextEditorProps) {
  // Workspace context is only available inside a BlockEditor tree - fine
  // here since `templateAware` is only ever set from within one (see
  // TemplatableMarkdown.tsx). `useTemplateAutocompleteSchema` is always
  // called (rules-of-hooks) but its query is harmless/idle-ish when unused.
  const { workspaceId, objectId } = useBlockEditor();
  const { data: templateSchema } = useTemplateAutocompleteSchema(workspaceId);
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
    objectTypes,
    editable,
    templateAware,
    workspaceId,
    objectId,
    templateSchema,
    // Save right away instead of waiting out the rest of the debounce below -
    // once focus has left, there's no more typing to coalesce, and a
    // templated field (see TemplatableMarkdown.tsx) is about to show its
    // rendered value, which depends on this save having actually gone out.
    onBlur: () => {
      clearTimeout(saveTimeout.current);
      flush();
      onBlur?.();
    },
    onFocus,
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
