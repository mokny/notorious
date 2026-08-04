/**
 * Helpers for the TipTap/ProseMirror JSON document stored as a table block's
 * `TableContent.doc` (see blockContent.ts) - shared between the web editor
 * (TableBlock.tsx, which edits the doc live) and the server (markdown
 * import/export, the `{{ }}` templating engine, and the one-off migration of
 * pre-rewrite `{ columns, rows }` tables). Kept dependency-free (no TipTap
 * import) so this package doesn't need to pull in the editor.
 */
export interface TableDocMark {
  type: string;
  attrs?: Record<string, unknown>;
}
export interface TableDocNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TableDocNode[];
  text?: string;
  marks?: TableDocMark[];
}
export interface TableDoc {
  type: "doc";
  content: TableDocNode[];
}

function findTable(doc: TableDoc | undefined | null): TableDocNode | null {
  return doc?.content?.find((n) => n.type === "table") ?? null;
}

function cellPlainText(cell: TableDocNode): string {
  const parts: string[] = [];
  const walk = (node: TableDocNode): void => {
    if (node.type === "text" && node.text) parts.push(node.text);
    node.content?.forEach(walk);
  };
  walk(cell);
  return parts.join("");
}

/** The field key used for both the templating engine (server) and TableBlock.tsx (client) to address one cell - keeps the two sides' indexing identical. */
export function tableCellField(rowIndex: number, colIndex: number): string {
  return `cells.${rowIndex}.${colIndex}`;
}

/** Row-major walk over every cell (header or body row alike) in document order. */
export function walkTableCells(doc: TableDoc | undefined | null, fn: (rowIndex: number, colIndex: number, cell: TableDocNode) => void): void {
  const table = findTable(doc);
  if (!table?.content) return;
  table.content.forEach((row, r) => {
    (row.content ?? []).forEach((cell, c) => fn(r, c, cell));
  });
}

/** Plain-text projection of every cell, e.g. for full-text search or Markdown export. */
export function tableDocToTextGrid(doc: TableDoc | undefined | null): string[][] {
  const grid: string[][] = [];
  walkTableCells(doc, (r, c, cell) => {
    grid[r] ??= [];
    grid[r][c] = cellPlainText(cell);
  });
  return grid;
}

/**
 * Builds a read-only variant of `doc` where every cell's text is replaced by
 * `renderedFields[cells.R.C]` (a cell absent from that map - i.e. one whose
 * source had no `{{ }}`/`{% %}` syntax - keeps its live content untouched).
 * Structure (colspan/rowspan/background/alignment/marks) is preserved;
 * mirrors TemplatableMarkdown.tsx's rendered/edit split, just at whole-table
 * granularity since one TipTap table is a single shared document rather
 * than independently editable per-cell fields.
 */
function firstParagraph(cell: TableDocNode): TableDocNode | undefined {
  return cell.content?.find((n) => n.type === "paragraph");
}

function firstTextMarks(cell: TableDocNode): TableDocMark[] | undefined {
  let found: TableDocMark[] | undefined;
  const walk = (node: TableDocNode): void => {
    if (found) return;
    if (node.type === "text" && node.marks?.length) {
      found = node.marks;
      return;
    }
    node.content?.forEach(walk);
  };
  walk(cell);
  return found;
}

export function buildRenderedTableDoc(doc: TableDoc, renderedFields: Record<string, string>): TableDoc {
  const table = findTable(doc);
  if (!table?.content) return doc;
  const newTable: TableDocNode = {
    ...table,
    content: table.content.map((row, rowIndex) => ({
      ...row,
      content: (row.content ?? []).map((cell, colIndex) => {
        const text = renderedFields[tableCellField(rowIndex, colIndex)];
        if (text === undefined) return cell;
        const paragraphAttrs = firstParagraph(cell)?.attrs;
        const marks = firstTextMarks(cell);
        return {
          ...cell,
          content: [
            {
              type: "paragraph",
              ...(paragraphAttrs ? { attrs: paragraphAttrs } : {}),
              content: text ? [{ type: "text", text, ...(marks ? { marks } : {}) }] : [],
            },
          ],
        };
      }),
    })),
  };
  return { type: "doc", content: doc.content.map((n) => (n === table ? newTable : n)) };
}

function makeCell(type: "tableHeader" | "tableCell", text?: string): TableDocNode {
  return { type, content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] };
}

/** The doc a freshly-inserted table block starts with - see BlockEditor.tsx's `defaultContentFor`. */
export function createEmptyTableDoc(rows = 3, cols = 3, withHeaderRow = true): TableDoc {
  const rowsContent: TableDocNode[] = Array.from({ length: rows }, (_, r) => ({
    type: "tableRow",
    content: Array.from({ length: cols }, () => makeCell(withHeaderRow && r === 0 ? "tableHeader" : "tableCell")),
  }));
  return { type: "doc", content: [{ type: "table", content: rowsContent }] };
}

/** Builds a doc from a plain header-row + body-rows grid - used by Markdown import and the pre-rewrite content migration. */
export function gridToTableDoc(columns: string[], rows: string[][]): TableDoc {
  const cols = Math.max(columns.length, ...rows.map((r) => r.length), 1);
  const headerRow: TableDocNode = {
    type: "tableRow",
    content: Array.from({ length: cols }, (_, c) => makeCell("tableHeader", columns[c])),
  };
  const bodyRows: TableDocNode[] = rows.map((row) => ({
    type: "tableRow",
    content: Array.from({ length: cols }, (_, c) => makeCell("tableCell", row[c])),
  }));
  return { type: "doc", content: [{ type: "table", content: [headerRow, ...bodyRows] }] };
}
