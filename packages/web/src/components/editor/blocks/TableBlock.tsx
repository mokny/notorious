import { useMemo, useRef, useState, type ReactNode } from "react";
import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Table from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import TextAlign from "@tiptap/extension-text-align";
import type { TableContent, TableDoc, TemplateAutocompleteSchemaResponse } from "@notorious/shared";
import { buildRenderedTableDoc, createEmptyTableDoc } from "@notorious/shared";
import { useDebouncedSave } from "../../../hooks/useDebouncedSave.js";
import { useTemplateAutocompleteSchema } from "../../../hooks/useTemplateAutocompleteSchema.js";
import { useBlockEditor } from "../BlockEditorContext.js";
import { TemplateHighlight } from "../TemplateHighlight.js";
import { TemplateSuggestion } from "../TemplateSuggestion.js";
import { Icon } from "../../ui/Icon.js";
import { TableCell, TableHeader } from "./tableExtensions.js";
import { TableFormatToolbar } from "./TableFormatToolbar.js";
import { TableGridControls } from "./TableGridControls.js";

/** `templateAware` mirrors RichTextEditor.tsx's prop of the same name - only ever true for the live-editable table (see EditableTable below), never the read-only/rendered variant, which shows already-evaluated cell text, not template source. */
function buildExtensions(templateAware: boolean, workspaceIdRef?: { current: string }, schemaRef?: { current: TemplateAutocompleteSchemaResponse | undefined }) {
  return [
    StarterKit.configure({
      heading: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
    }),
    TextStyle,
    Color,
    TextAlign.configure({ types: ["paragraph"] }),
    // cellMinWidth must match the `min-width` fallback for unresized columns
    // in globals.css's `.notorious-table-editor td/th` rule.
    Table.configure({ resizable: true, cellMinWidth: 60 }),
    TableRow,
    TableHeader,
    TableCell,
    ...(templateAware && workspaceIdRef && schemaRef ? [TemplateHighlight, TemplateSuggestion.configure({ workspaceIdRef, schemaRef })] : []),
  ];
}

/** One TipTap editor instance over the whole table doc (see blockContent.ts's TableContent) - editable live view, debounced-saved like every other block. */
function EditableTable({
  doc,
  editable,
  onChange,
  onFlush,
  onFocus,
  onBlur,
}: {
  doc: TableDoc;
  editable: boolean;
  onChange: (doc: TableDoc) => void;
  onFlush: () => void;
  onFocus: () => void;
  onBlur: () => void;
}) {
  const { workspaceId } = useBlockEditor();
  const { data: templateSchema } = useTemplateAutocompleteSchema(workspaceId);
  const workspaceIdRef = useRef(workspaceId);
  workspaceIdRef.current = workspaceId;
  const schemaRef = useRef(templateSchema);
  schemaRef.current = templateSchema;

  const extensions = useMemo(() => buildExtensions(true, workspaceIdRef, schemaRef), []);
  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);

  const tiptapEditor = useEditor({
    extensions,
    content: doc as unknown as Record<string, unknown>,
    editable,
    onUpdate: ({ editor: updated }) => onChange(updated.getJSON() as TableDoc),
    onFocus: () => onFocus(),
    onBlur: () => {
      onFlush();
      onBlur();
    },
    onCreate: ({ editor: created }) => setEditor(created),
  });

  return (
    <div className="group relative overflow-x-auto rounded-lg border border-border p-1 pl-4 pt-4">
      {editor && !editor.isDestroyed && editable && <TableFormatToolbar editor={editor} />}
      <div ref={setContainerEl} className="relative">
        <EditorContent editor={tiptapEditor} className="notorious-table-editor" />
        {editor && !editor.isDestroyed && editable && containerEl && <TableGridControls editor={editor} container={containerEl} />}
      </div>
    </div>
  );
}

/** Read-only rendering of a doc (e.g. the templated/rendered variant while unfocused, or any table when the object/share is read-only) - no toolbar, no grid controls, click-to-edit handled by the parent. */
function ReadOnlyTable({ doc }: { doc: TableDoc }) {
  const extensions = useMemo(() => buildExtensions(false), []);
  const editor = useEditor({ extensions, content: doc as unknown as Record<string, unknown>, editable: false });
  return <EditorContent editor={editor} className="notorious-table-editor overflow-x-auto rounded-lg border border-border p-1" />;
}

export function TableBlock({
  blockId,
  content: externalContent,
  onSave,
}: {
  blockId: string;
  content: TableContent;
  onSave: (c: TableContent) => Promise<void>;
}) {
  const { readOnly, renderedBlocks } = useBlockEditor();
  const [content, save, flushSave] = useDebouncedSave(externalContent, onSave);
  const doc = content?.doc ?? createEmptyTableDoc();

  const renderedFields = renderedBlocks?.[blockId];
  const hasTemplatedCells = Boolean(renderedFields && Object.keys(renderedFields).length > 0);
  const [editing, setEditing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const showRendered = hasTemplatedCells && (readOnly || !editing);

  let table: ReactNode;
  if (showRendered) {
    const renderedDoc = buildRenderedTableDoc(doc, renderedFields ?? {});
    table = (
      <div className={readOnly ? undefined : "cursor-text"} onClick={() => !readOnly && setEditing(true)}>
        <ReadOnlyTable key="rendered" doc={renderedDoc} />
      </div>
    );
  } else if (readOnly) {
    table = <ReadOnlyTable key="readonly" doc={doc} />;
  } else {
    table = (
      <EditableTable
        key="edit"
        doc={doc}
        editable
        onChange={(nextDoc) => save({ ...content, doc: nextDoc })}
        onFlush={flushSave}
        onFocus={() => setEditing(true)}
        onBlur={() => setEditing(false)}
      />
    );
  }

  return (
    <div
      className={`group ${isFullscreen ? "fixed inset-0 z-[60] overflow-auto bg-surface p-4" : "relative"}`}
    >
      <button
        type="button"
        onClick={() => setIsFullscreen((v) => !v)}
        title={isFullscreen ? "Exit fullscreen" : "Fill the browser window"}
        // A view preference, not shared content - stays usable even while the
        // object is locked or viewed by an anonymous share visitor (see
        // readOnlyContent.ts / globals.css's `.locked-content` rule).
        data-view-toggle
        className="absolute right-1 top-1 z-10 rounded p-1.5 text-ink-muted opacity-0 transition-opacity hover:bg-surface-raised hover:text-ink group-hover:opacity-100"
      >
        <Icon name={isFullscreen ? "minimize" : "maximize"} className="h-3.5 w-3.5" />
      </button>
      {table}
    </div>
  );
}
