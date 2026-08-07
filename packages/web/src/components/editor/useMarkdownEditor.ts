import { useEffect, useMemo, useRef } from "react";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Markdown } from "tiptap-markdown";
import type { BlockType, ObjectType, TemplateAutocompleteSchemaResponse } from "@notorious/shared";
import type { EditorView } from "@tiptap/pm/view";
import { SlashCommand, slashCommandPluginKey } from "./SlashCommand.js";
import { TemplateHighlight } from "./TemplateHighlight.js";
import { TemplateSuggestion, templateSuggestionPluginKey } from "./TemplateSuggestion.js";
import { SearchHighlight } from "./SearchHighlight.js";
import { unescapeTemplateRegions } from "../../lib/templateMarkdown.js";

/**
 * `Link`'s `autolink`/`linkOnPaste` options (disabled below for templateAware
 * fields) only gate two of its three link-creation mechanisms - its
 * `addPasteRules()` markPasteRule runs unconditionally on every paste
 * regardless of either option (see @tiptap/extension-link's source), so a
 * pasted URL inside `{{ }}`/`{% %}` source still silently got wrapped in a
 * Link mark without this override. That mark then round-trips through
 * markdown as `<url>` (prosemirror-markdown's plain-autolink serialization),
 * corrupting the template source on save - confirmed by inspecting a
 * corrupted block directly in the dev DB.
 */
const TemplateAwareLink = Link.extend({
  addPasteRules() {
    return [];
  },
});

interface UseMarkdownEditorOptions {
  markdown: string;
  placeholder?: string;
  onChange: (markdown: string) => void;
  onEnter?: () => void;
  onBackspaceEmpty?: () => void;
  onSlashSelect?: (type: BlockType, extraContent?: Record<string, unknown>) => void;
  /** For the slash menu's per-object-type "create a new X" entries - see SlashCommand.ts. */
  objectTypes?: ObjectType[];
  /** Adds TemplateHighlight/TemplateSuggestion - see RichTextEditor.tsx's `templateAware` prop. */
  templateAware?: boolean;
  workspaceId?: string;
  /** The object this field's blocks belong to - for `blocks.<slug>` autocomplete (see TemplateSuggestion.ts), scoped to just this object's own blocks like the renderer itself scopes `blocks.<slug>` (see modules/templates/renderer.ts). */
  objectId?: string;
  templateSchema?: TemplateAutocompleteSchemaResponse;
  /** Fired when this editor loses focus - see TemplatableMarkdown.tsx, which uses it to switch a templated field back to its rendered display. */
  onBlur?: () => void;
  /** Fired when this editor gains focus - see TemplatableMarkdown.tsx, which uses it to mark a templated field as actively being edited (so it can't involuntarily flip to its rendered display mid-typing if a save+refetch lands while still focused). */
  onFocus?: () => void;
  /**
   * Defaults to true. Set to false for a locked object/embedded preview
   * (see BlockEditorContext.tsx's `readOnly`) - TipTap then blocks edits at
   * the ProseMirror level (`contenteditable="false"` on the DOM node)
   * instead of this app's usual `pointer-events: none` CSS trick, which
   * would also block text selection/copy - exactly what should still work
   * while read-only.
   */
  editable?: boolean;
  /** See BlockEditorContext.tsx's `searchHighlight`. */
  searchHighlight?: { terms: string[]; activeBlockId: string | null } | null;
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
  const onBlurRef = useRef(options.onBlur);
  const onFocusRef = useRef(options.onFocus);
  // Read fresh (not closed over) inside `onUpdate` below - toggling editable
  // off doesn't recreate the editor, so a stale closure here would keep
  // whatever `editable` was true at creation time.
  const editableRef = useRef(options.editable ?? true);
  editableRef.current = options.editable ?? true;
  // Read at call-time by the extension (see SlashCommand.ts's `objectTypesRef`
  // param), not just when it's configured below - object types can still be
  // loading (or change) after this editor instance is created.
  const objectTypesRef = useRef<ObjectType[]>(options.objectTypes ?? []);
  // Same call-time-read pattern as objectTypesRef above, for
  // TemplateSuggestion.ts (see its own doc comment).
  const workspaceIdRef = useRef(options.workspaceId ?? "");
  const objectIdRef = useRef(options.objectId ?? "");
  const templateSchemaRef = useRef(options.templateSchema);

  onChangeRef.current = options.onChange;
  onEnterRef.current = options.onEnter;
  onBackspaceEmptyRef.current = options.onBackspaceEmpty;
  onSlashSelectRef.current = options.onSlashSelect;
  onBlurRef.current = options.onBlur;
  onFocusRef.current = options.onFocus;
  objectTypesRef.current = options.objectTypes ?? [];
  workspaceIdRef.current = options.workspaceId ?? "";
  objectIdRef.current = options.objectId ?? "";
  templateSchemaRef.current = options.templateSchema;

  const hasSlashCommand = Boolean(options.onSlashSelect);
  const templateAware = Boolean(options.templateAware);
  const searchTerms = options.searchHighlight?.terms ?? [];
  // Joined to a primitive for the dependency array below - the array itself
  // is a fresh object every render (BlockEditor.tsx doesn't memoize it), so
  // depending on it by reference would recompute `extensions` on every
  // unrelated re-render instead of only when the actual words change.
  const searchTermsKey = searchTerms.join(" ");

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
      // `autolink`/`linkOnPaste` (both on by default) turn a bare URL you
      // type or paste into a Link mark - great for normal prose, but a URL
      // inside a templateAware field's `{{ }}`/`{% %}` source is a string
      // literal, not prose, and auto-linking it corrupts the saved markdown:
      // prosemirror-markdown serializes a plain-URL link as `<url>` (see
      // `isPlainURL` in prosemirror-markdown), silently rewriting the
      // template's own source text on every keystroke. Disabled here so a
      // pasted/typed URL inside template code stays exactly what was typed -
      // `TemplateAwareLink` additionally overrides `addPasteRules` (see its
      // own comment above), which these two options alone don't cover.
      templateAware
        ? TemplateAwareLink.configure({ openOnClick: false, autolink: false, linkOnPaste: false })
        : Link.configure({ openOnClick: false }),
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
      ...(templateAware ? [TemplateHighlight, TemplateSuggestion.configure({ workspaceIdRef, objectIdRef, schemaRef: templateSchemaRef })] : []),
      // Always included (cheap no-op when there are no active search terms) -
      // see SearchHighlight.ts's own doc comment for why it only ever tracks
      // *which words* to highlight, not which occurrence is "active".
      SearchHighlight.configure({ terms: searchTerms }),
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.placeholder, hasSlashCommand, templateAware, searchTermsKey],
  );

  const editorProps = useMemo(
    () => ({
      // `handleKeyDown` here is a *view-level* editorProp, which ProseMirror
      // always consults before any plugin's own `handleKeyDown` (see
      // EditorView.someProp: direct props win over `state.plugins`) -
      // without this check, Enter would always create a new block instead of
      // ever reaching SlashCommand/TemplateSuggestion's own Enter-accepts-
      // the-highlighted-item handling while one of those popups is open.
      handleKeyDown: (view: EditorView, event: KeyboardEvent) => {
        const suggestionOpen = [slashCommandPluginKey, templateSuggestionPluginKey].some(
          (key) => (key.getState(view.state) as { active?: boolean } | undefined)?.active,
        );
        if (suggestionOpen) return false;
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
    editable: options.editable ?? true,
    onUpdate: ({ editor: updatedEditor }) => {
      // Belt-and-suspenders: never persist a change while this editor is
      // read-only, no matter what triggered `onUpdate` - a locked object or
      // Preview mode toggling `editable` can apparently still produce a
      // spurious update event around the transition (observed: switching
      // Preview back off fired one carrying the *rendered* text, which would
      // otherwise have silently overwritten the block's real template
      // source). The actual invariant that matters is "read-only never
      // saves," regardless of the exact ProseMirror mechanism involved.
      if (!editableRef.current) return;
      const storage = updatedEditor.storage as { markdown: { getMarkdown: () => string } };
      // The markdown serializer escapes `{{ row[1] * 2 }}`-style template
      // code as if it were prose (`row\[1\] \* 2`) - see templateMarkdown.ts
      // for why and how this undoes it.
      onChangeRef.current?.(unescapeTemplateRegions(storage.markdown.getMarkdown().trim()));
    },
    onBlur: () => onBlurRef.current?.(),
    onFocus: () => onFocusRef.current?.(),
  });

  // `editable` above only seeds the editor once, on creation (same caveat
  // as `content` below) - an object being locked/unlocked after this editor
  // already mounted needs to actually flip ProseMirror's own editable state
  // via `setEditable`, not just get a new (ignored) constructor option.
  // `emitUpdate: false` - `setEditable` otherwise fires a TipTap `update`
  // event by default (even when the value isn't actually changing, e.g. on
  // every fresh mount, since `editable` above already seeded the same value
  // at construction) - that reached our own `onUpdate` above and queued a
  // spurious save of the *unchanged* content. Harmless by itself, but its
  // extra save+refetch cycle was firing every time a templated field
  // remounted into edit mode (see TemplatableMarkdown.tsx), which was enough
  // to desync HeadingBlock's separate focus-within tracking for its h1/h2/h3
  // selector.
  useEffect(() => {
    editor?.setEditable(options.editable ?? true, false);
  }, [options.editable, editor]);

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
    // Same unescaping as onUpdate above, so this comparison isn't fooled by
    // the serializer re-escaping `{{ }}`/`{% %}` content that hasn't
    // actually changed, which would otherwise call setContent needlessly.
    if (unescapeTemplateRegions(storage.markdown.getMarkdown().trim()) === options.markdown.trim()) return;
    editor.commands.setContent(options.markdown, false);
  }, [options.markdown, editor]);

  return editor;
}
