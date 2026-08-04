import type { Editor } from "@tiptap/core";
import type { Node as PMNode } from "@tiptap/pm/model";

function findTableNode(doc: PMNode): { node: PMNode; pos: number } | null {
  let result: { node: PMNode; pos: number } | null = null;
  doc.descendants((node, pos) => {
    if (result) return false;
    if (node.type.name === "table") {
      result = { node, pos };
      return false;
    }
    return true;
  });
  return result;
}

/**
 * Finds the doc position inside the table cell at (rowIndex, colIndex) -
 * needed because TipTap's structural table commands (addColumnBefore,
 * deleteRow, mergeCells, ...) always act relative to the *current selection*,
 * never an arbitrary index, so TableGridControls.tsx has to move the
 * selection there first before running one. Column index tracking is a
 * simple running count of preceding cells' `colspan` within the *same* row -
 * doesn't resolve spans carried down from earlier rows the way a full table
 * grid map would; an acceptable approximation since the boundary buttons
 * this feeds are positioned from actual first-row cell rects anyway.
 */
export function findCellPos(editor: Editor, rowIndex: number, colIndex: number): number | null {
  const table = findTableNode(editor.state.doc);
  if (!table) return null;
  let result: number | null = null;
  const tableContentStart = table.pos + 1;
  table.node.forEach((rowNode, rowOffset, rIdx) => {
    if (result !== null || rIdx !== rowIndex) return;
    const rowContentStart = tableContentStart + rowOffset + 1;
    let col = 0;
    rowNode.forEach((cellNode, cellOffset) => {
      if (result !== null) return;
      const span = (cellNode.attrs.colspan as number) ?? 1;
      if (colIndex >= col && colIndex < col + span) {
        const cellContentStart = rowContentStart + cellOffset + 1;
        result = cellContentStart + 1;
      }
      col += span;
    });
  });
  return result;
}

export function countTableColumns(editor: Editor): number {
  const table = findTableNode(editor.state.doc);
  if (!table) return 0;
  let max = 0;
  table.node.forEach((rowNode) => {
    let count = 0;
    rowNode.forEach((cellNode) => {
      count += (cellNode.attrs.colspan as number) ?? 1;
    });
    max = Math.max(max, count);
  });
  return max;
}

export function countTableRows(editor: Editor): number {
  const table = findTableNode(editor.state.doc);
  return table ? table.node.childCount : 0;
}

/** Moves the selection into (rowIndex, colIndex) and runs `fn` there - see findCellPos for why. */
export function withCellSelection(editor: Editor, rowIndex: number, colIndex: number, fn: () => void): void {
  const pos = findCellPos(editor, rowIndex, colIndex);
  if (pos === null) return;
  editor.chain().focus().setTextSelection(pos).run();
  fn();
}
