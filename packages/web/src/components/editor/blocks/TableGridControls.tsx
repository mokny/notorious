import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { Editor } from "@tiptap/core";
import { Icon } from "../../ui/Icon.js";
import { withCellSelection } from "./tableSelection.js";

interface Geometry {
  colBoundaries: number[];
  rowBoundaries: number[];
}

function measure(container: HTMLElement): Geometry | null {
  const table = container.querySelector("table");
  if (!table || table.rows.length === 0) return null;
  const containerRect = container.getBoundingClientRect();

  const firstRow = table.rows[0]!;
  const colBoundaries: number[] = [];
  Array.from(firstRow.cells).forEach((cell, i) => {
    const rect = cell.getBoundingClientRect();
    if (i === 0) colBoundaries.push(rect.left - containerRect.left);
    colBoundaries.push(rect.right - containerRect.left);
  });

  const rowBoundaries: number[] = [];
  Array.from(table.rows).forEach((row, i) => {
    const firstCell = row.cells[0];
    if (!firstCell) return;
    const rect = firstCell.getBoundingClientRect();
    if (i === 0) rowBoundaries.push(rect.top - containerRect.top);
    rowBoundaries.push(rect.bottom - containerRect.top);
  });

  return { colBoundaries, rowBoundaries };
}

/**
 * Floating "+" buttons at every row/column boundary of the table currently
 * rendered inside `container` (see TableBlock.tsx) - lets you insert a row
 * or column at any position, not just append one, since TipTap's own
 * addRowBefore/addColumnBefore commands always act relative to whatever
 * cell the selection is currently in (see tableSelection.ts's
 * `withCellSelection`). Positions are read from the real DOM (not derived
 * from column/row counts) so they line up with merged/resized cells;
 * recomputed on every editor transaction and on container resize.
 */
export function TableGridControls({ editor, container }: { editor: Editor; container: HTMLElement }) {
  const { t } = useTranslation();
  const [geometry, setGeometry] = useState<Geometry | null>(null);

  useEffect(() => {
    const recompute = () => setGeometry(measure(container));
    recompute();
    const observer = new ResizeObserver(recompute);
    observer.observe(container);
    editor.on("update", recompute);
    editor.on("selectionUpdate", recompute);
    return () => {
      observer.disconnect();
      editor.off("update", recompute);
      editor.off("selectionUpdate", recompute);
    };
  }, [editor, container]);

  if (!geometry) return null;
  const colCount = geometry.colBoundaries.length - 1;
  const rowCount = geometry.rowBoundaries.length - 1;

  function insertColumn(boundaryIndex: number) {
    if (boundaryIndex >= colCount) withCellSelection(editor, 0, colCount - 1, () => editor.chain().focus().addColumnAfter().run());
    else withCellSelection(editor, 0, boundaryIndex, () => editor.chain().focus().addColumnBefore().run());
  }
  function insertRow(boundaryIndex: number) {
    if (boundaryIndex >= rowCount) withCellSelection(editor, rowCount - 1, 0, () => editor.chain().focus().addRowAfter().run());
    else withCellSelection(editor, boundaryIndex, 0, () => editor.chain().focus().addRowBefore().run());
  }

  return (
    <div className="pointer-events-none absolute inset-0" onMouseDown={(e) => e.preventDefault()}>
      {geometry.colBoundaries.map((x, i) => (
        <button
          key={`col-${i}`}
          type="button"
          onClick={() => insertColumn(i)}
          className="pointer-events-auto absolute z-10 flex h-4 w-4 -translate-x-1/2 -translate-y-full items-center justify-center rounded bg-accent text-white opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-50"
          style={{ left: x, top: geometry.rowBoundaries[0]! - 2 }}
          title={t("editor.blocks.table.insertColumn")}
        >
          <Icon name="plus" className="h-3 w-3" />
        </button>
      ))}
      {geometry.rowBoundaries.map((y, i) => (
        <button
          key={`row-${i}`}
          type="button"
          onClick={() => insertRow(i)}
          className="pointer-events-auto absolute z-10 flex h-4 w-4 -translate-x-full -translate-y-1/2 items-center justify-center rounded bg-accent text-white opacity-0 transition-opacity hover:opacity-100 group-hover:opacity-50"
          style={{ left: geometry.colBoundaries[0]! - 2, top: y }}
          title={t("editor.blocks.table.insertRow")}
        >
          <Icon name="plus" className="h-3 w-3" />
        </button>
      ))}
    </div>
  );
}
