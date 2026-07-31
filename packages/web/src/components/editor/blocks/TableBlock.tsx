import type { TableContent } from "@notorious/shared";
import { useDebouncedSave } from "../../../hooks/useDebouncedSave.js";
import { Icon } from "../../ui/Icon.js";
import { useBlockEditor } from "../BlockEditorContext.js";

export function TableBlock({
  content: externalContent,
  onSave,
}: {
  content: TableContent;
  onSave: (c: TableContent) => Promise<void>;
}) {
  const { readOnly } = useBlockEditor();
  const [content, save] = useDebouncedSave(externalContent, onSave);
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
                <input
                  value={column}
                  onChange={(e) => setColumn(index, e.target.value)}
                  readOnly={readOnly}
                  autoComplete="off"
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
                  <input
                    value={row[colIndex] ?? ""}
                    onChange={(e) => setCell(rowIndex, colIndex, e.target.value)}
                    readOnly={readOnly}
                    autoComplete="off"
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
