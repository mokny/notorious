import { useRef } from "react";
import type { TableContent } from "@notorious/shared";
import { useDebouncedSave } from "../../../hooks/useDebouncedSave.js";
import { Icon } from "../../ui/Icon.js";
import { useBlockEditor } from "../BlockEditorContext.js";
import { useTemplatableField } from "../useTemplatableField.js";

/** One column header or cell - see ChecklistBlock.tsx's identical rendered/editing split for why this isn't just an `<input>`. */
function TableCellInput({
  blockId,
  field,
  value,
  onChange,
  onFlush,
  readOnly,
  className,
}: {
  blockId: string;
  field: string;
  value: string;
  onChange: (value: string) => void;
  /** Saves a pending edit right away on blur instead of waiting out the rest of useDebouncedSave's window - see RichTextEditor.tsx's identical onBlur flush. */
  onFlush: () => void;
  readOnly: boolean;
  className: string;
}) {
  const { rendered, showRendered, startEditing, stopEditing } = useTemplatableField(blockId, field);
  const focusOnEditRef = useRef(false);

  if (showRendered) {
    return (
      <div
        onClick={() => {
          focusOnEditRef.current = true;
          startEditing();
        }}
        className={`${className} ${readOnly ? "" : "cursor-text"}`}
      >
        {rendered || " "}
      </div>
    );
  }

  return (
    <input
      ref={(el) => {
        if (el && focusOnEditRef.current) {
          el.focus();
          focusOnEditRef.current = false;
        }
      }}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        onFlush();
        stopEditing();
      }}
      readOnly={readOnly}
      autoComplete="off"
      className={className}
    />
  );
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
  const { readOnly } = useBlockEditor();
  const [content, save, flushSave] = useDebouncedSave(externalContent, onSave);
  const columns = content.columns?.length ? content.columns : ["Column 1", "Column 2"];
  const rows = content.rows ?? [];

  function setColumn(index: number, value: string) {
    save({ ...content, columns: columns.map((c, i) => (i === index ? value : c)), rows });
  }

  function setCell(rowIndex: number, colIndex: number, value: string) {
    // `.map()` over a row can only ever touch indices the row already has -
    // rows shorter than the column count (e.g. a freshly created table's
    // default `[]` row) would silently drop edits to any cell past their
    // current length. Pad to the full column count first so every cell index
    // always exists to write into.
    const nextRows = rows.map((row, r) => {
      if (r !== rowIndex) return row;
      const paddedRow = columns.map((_, c) => row[c] ?? "");
      paddedRow[colIndex] = value;
      return paddedRow;
    });
    save({ ...content, columns, rows: nextRows });
  }

  function addColumn() {
    save({ ...content, columns: [...columns, `Column ${columns.length + 1}`], rows: rows.map((row) => [...row, ""]) });
  }

  function addRow() {
    save({ ...content, columns, rows: [...rows, columns.map(() => "")] });
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {columns.map((column, index) => (
              <th key={index} className="border-b border-border bg-surface-raised p-1.5 text-left">
                <TableCellInput
                  blockId={blockId}
                  field={`columns.${index}`}
                  value={column}
                  onChange={(value) => setColumn(index, value)}
                  onFlush={flushSave}
                  readOnly={readOnly}
                  className="w-full border-none bg-transparent font-medium outline-none"
                />
              </th>
            ))}
            <th className="w-8 border-b border-border bg-surface-raised">
              <button onClick={addColumn} className="p-1 text-ink-muted hover:text-accent">
                <Icon name="plus" className="h-3.5 w-3.5" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {columns.map((_, colIndex) => (
                <td key={colIndex} className="border-b border-border p-1.5">
                  <TableCellInput
                    blockId={blockId}
                    field={`rows.${rowIndex}.${colIndex}`}
                    value={row[colIndex] ?? ""}
                    onChange={(value) => setCell(rowIndex, colIndex, value)}
                    onFlush={flushSave}
                    readOnly={readOnly}
                    className="w-full border-none bg-transparent outline-none"
                  />
                </td>
              ))}
              <td className="border-b border-border" />
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addRow} className="flex w-full items-center gap-1 p-1.5 text-xs text-ink-muted hover:text-accent">
        <Icon name="plus" className="h-3 w-3" /> Add row
      </button>
    </div>
  );
}
