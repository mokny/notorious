import type { TableContent } from "@notorious/shared";
import { Icon } from "../../ui/Icon.js";

export function TableBlock({ content, onSave }: { content: TableContent; onSave: (c: TableContent) => void }) {
  const columns = content.columns?.length ? content.columns : ["Column 1", "Column 2"];
  const rows = content.rows ?? [];

  function setColumn(index: number, value: string) {
    onSave({ columns: columns.map((c, i) => (i === index ? value : c)), rows });
  }

  function setCell(rowIndex: number, colIndex: number, value: string) {
    const nextRows = rows.map((row, r) => (r === rowIndex ? row.map((cell, c) => (c === colIndex ? value : cell)) : row));
    onSave({ columns, rows: nextRows });
  }

  function addColumn() {
    onSave({ columns: [...columns, `Column ${columns.length + 1}`], rows: rows.map((row) => [...row, ""]) });
  }

  function addRow() {
    onSave({ columns, rows: [...rows, columns.map(() => "")] });
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
